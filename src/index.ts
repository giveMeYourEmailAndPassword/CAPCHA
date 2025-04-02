import { chromium, Page } from "playwright";
import { config } from "./config";

async function getTurnstileSolution(
  apiKey: string,
  siteKey: string,
  pageUrl: string
): Promise<string | null> {
  const inUrl = "http://2captcha.com/in.php";
  const payload = {
    key: apiKey,
    method: "turnstile",
    sitekey: siteKey,
    pageurl: pageUrl,
    json: 1,
  };

  try {
    const response = await fetch(inUrl, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const result = await response.json();

    if (result.status !== 1) {
      console.log("Error submitting task:", result.request);
      return null;
    }

    const captchaId = result.request;
    console.log("CAPTCHA solving task submitted, ID:", captchaId);

    // Опрашиваем результат каждые 5 секунд
    const resUrl = "http://2captcha.com/res.php";
    const params = new URLSearchParams({
      key: apiKey,
      action: "get",
      id: captchaId,
      json: "1",
    });

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const resResponse = await fetch(`${resUrl}?${params}`);
      const resResult = await resResponse.json();

      if (resResult.status === 1) {
        console.log("CAPTCHA solution received:", resResult.request);
        return resResult.request;
      } else if (resResult.request === "CAPCHA_NOT_READY") {
        console.log("Solution not ready yet, retrying...");
        continue;
      } else {
        console.log("Error retrieving solution:", resResult.request);
        return null;
      }
    }
  } catch (error) {
    console.error("Error while solving CAPTCHA:", error);
    return null;
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    console.log("Открываем страницу...");
    await page.goto("https://visa.vfsglobal.com/kaz/ru/bgr/login");

    console.log("Ждем загрузки страницы...");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000);

    // Ищем Turnstile элемент и получаем sitekey
    const turnstileElement = await page
      .locator('iframe[src*="challenges.cloudflare.com"]')
      .first();
    if (turnstileElement) {
      const siteKey = await turnstileElement.getAttribute("data-sitekey");
      if (siteKey) {
        console.log("Found Turnstile sitekey:", siteKey);

        // Получаем решение от 2captcha
        const token = await getTurnstileSolution(
          config.captchaApiKey,
          siteKey,
          page.url()
        );

        if (token) {
          // Вставляем токен в скрытое поле
          await page.evaluate((token) => {
            const input = document.querySelector(
              'input[name="cf-turnstile-response"]'
            );
            if (input) {
              (input as HTMLInputElement).value = token;
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }, token);
        }
      }
    }

    // Заполняем поля логина и пароля
    await page.waitForSelector("#username");
    await page.fill("#username", config.email);
    await page.waitForTimeout(1000);

    await page.waitForSelector("#password");
    await page.fill("#password", config.password);
    await page.waitForTimeout(1000);

    // Ждем перед закрытием
    await page.waitForTimeout(10000);
  } catch (error) {
    console.error("Произошла ошибка:", error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
