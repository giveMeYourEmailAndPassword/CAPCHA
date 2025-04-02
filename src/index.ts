import { chromium, Page } from "playwright";
import { config } from "./config";

interface TurnstileOptions {
  sitekey: string;
  cData?: string;
  chlPageData?: string;
  action?: string;
  callback?: (token: string) => void;
}

async function getTurnstileSolution(
  apiKey: string,
  siteKey: string,
  pageUrl: string
): Promise<string | null> {
  // URL для создания задачи
  const createTaskUrl = "https://api.2captcha.com/createTask";

  // Формируем запрос согласно документации
  const createTaskPayload = {
    clientKey: apiKey,
    task: {
      type: "TurnstileTaskProxyless",
      websiteURL: pageUrl,
      websiteKey: siteKey,
    },
  };

  try {
    // Создаем задачу
    console.log("Creating captcha task...");
    const createResponse = await fetch(createTaskUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createTaskPayload),
    });

    const createResult = await createResponse.json();

    if (!createResult.taskId) {
      console.log("Error creating task:", createResult);
      return null;
    }

    console.log("Task created, ID:", createResult.taskId);

    // URL для получения результата
    const getResultUrl = "https://api.2captcha.com/getTaskResult";

    // Ждем результат
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const getResultPayload = {
        clientKey: apiKey,
        taskId: createResult.taskId,
      };

      const resultResponse = await fetch(getResultUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(getResultPayload),
      });

      const result = await resultResponse.json();

      if (result.status === "ready") {
        console.log("Got solution token");
        return result.solution.token;
      } else if (result.status === "processing") {
        console.log("Still waiting for solution...");
        continue;
      } else {
        console.log("Error getting result:", result);
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
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1920,1080",
      "--start-maximized",
    ],
  });

  let page;

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "ru-RU",
      timezoneId: "Asia/Almaty",
      geolocation: { longitude: 76.9286, latitude: 43.2567 },
      permissions: ["geolocation"],
    });

    // Добавляем эмуляцию плагинов и других свойств браузера
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
          {
            name: "Chrome PDF Viewer",
            filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
          },
          { name: "Native Client", filename: "internal-nacl-plugin" },
        ],
      });
    });

    page = await context.newPage();

    console.log("Открываем страницу...");
    await page.goto("https://visa.vfsglobal.com/kaz/ru/bgr/login", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000);

    // Принимаем куки если они есть
    try {
      await page.click("#onetrust-accept-btn-handler");
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log("Кнопка куки не найдена");
    }

    // Ищем и заполняем email
    try {
      console.log("Ищем поле email...");

      // Ждем появления поля
      await page.waitForSelector('input[formcontrolname="username"]', {
        state: "visible",
        timeout: 10000,
      });

      // Заполняем email через evaluate
      await page.evaluate((email: string) => {
        const inputs = document.querySelectorAll(
          'input[formcontrolname="username"]'
        );
        inputs.forEach((input: Element) => {
          if (
            (input as HTMLInputElement)
              .getAttribute("placeholder")
              ?.includes("email")
          ) {
            (input as HTMLInputElement).value = email;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(new Event("blur", { bubbles: true }));
          }
        });
      }, config.email);

      console.log("Email введен");
      await page.waitForTimeout(2000);

      // Ищем и заполняем пароль
      console.log("Ищем поле пароля...");
      await page.waitForSelector('input[formcontrolname="password"]', {
        state: "visible",
        timeout: 10000,
      });

      await page.evaluate((password: string) => {
        const input = document.querySelector(
          'input[formcontrolname="password"]'
        ) as HTMLInputElement;
        if (input) {
          input.value = password;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.dispatchEvent(new Event("blur", { bubbles: true }));
        }
      }, config.password);

      console.log("Пароль введен");

      // Проверяем состояние формы
      const formState = await page.evaluate(() => {
        const emailInput = document.querySelector(
          'input[formcontrolname="username"]'
        ) as HTMLInputElement;
        const passwordInput = document.querySelector(
          'input[formcontrolname="password"]'
        ) as HTMLInputElement;
        return {
          email: emailInput ? emailInput.value : "не найдено",
          hasPassword: passwordInput ? !!passwordInput.value : false,
        };
      });

      console.log("Состояние формы:", formState);

      // Делаем скриншот заполненной формы
      await page.screenshot({ path: "filled-form.png", fullPage: true });
    } catch (e) {
      console.error("Ошибка при заполнении формы:", e);
      await page.screenshot({ path: "form-error.png" });
    }

    // Ждем перед закрытием
    await page.waitForTimeout(30000);
  } catch (error) {
    console.error("Произошла ошибка:", error);
    if (page) {
      await page.screenshot({ path: "error.png" });
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Добавляем глобальные типы
declare global {
  interface Window {
    turnstile: {
      render: (containerId: string, options: TurnstileOptions) => string;
    };
    tsCallback?: (token: string) => void;
  }
}

main().catch(console.error);
