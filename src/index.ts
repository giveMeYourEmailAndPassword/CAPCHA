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
    slowMo: 1000,
  });

  let page;

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });

    page = await context.newPage();

    // Добавляем скрипт для перехвата параметров Turnstile с правильной типизацией
    await page.addInitScript(() => {
      const i = setInterval(() => {
        if (window.turnstile) {
          clearInterval(i);
          window.turnstile.render = (
            _containerId: string,
            options: TurnstileOptions
          ) => {
            let p = {
              type: "TurnstileTaskProxyless",
              websiteKey: options.sitekey,
              websiteURL: window.location.href,
              data: options.cData,
              pagedata: options.chlPageData,
              action: options.action,
              userAgent: navigator.userAgent,
            };
            console.log("Turnstile params:", JSON.stringify(p));
            window.tsCallback = options.callback;
            return "foo";
          };
        }
      }, 10);
    });

    console.log("Открываем страницу...");
    await page.goto("https://visa.vfsglobal.com/kaz/ru/bgr/login", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    console.log("Ждем загрузки страницы...");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle");

    // Ждем появления и нажимаем кнопку принятия cookie
    console.log("Ищем кнопку принятия cookie...");
    try {
      await page.waitForSelector("#onetrust-accept-btn-handler", {
        state: "visible",
        timeout: 30000,
      });
      console.log("Кнопка cookie найдена, пытаемся нажать...");

      // Пробуем разные способы нажатия
      try {
        await page.click("#onetrust-accept-btn-handler", { force: true });
      } catch {
        await page.evaluate(() => {
          const button = document.querySelector(
            "#onetrust-accept-btn-handler"
          ) as HTMLElement;
          if (button) button.click();
        });
      }

      console.log("Куки приняты");
      await page.waitForTimeout(5000);
    } catch (e) {
      console.log("Проблема с кнопкой cookie:", e);
    }

    // Проверяем наличие полей ввода и их состояние
    console.log("Проверяем поля ввода...");
    try {
      await page.waitForSelector("#username", {
        state: "visible",
        timeout: 30000,
      });
      console.log("Поле username найдено");

      await page.waitForSelector("#password", {
        state: "visible",
        timeout: 30000,
      });
      console.log("Поле password найдено");

      // Пробуем заполнить поля с задержкой
      await page.waitForTimeout(2000);
      await page.type("#username", config.email, { delay: 100 });
      console.log("Email введен");

      await page.waitForTimeout(1000);
      await page.type("#password", config.password, { delay: 100 });
      console.log("Пароль введен");
    } catch (e) {
      console.log("Проблема с полями ввода:", e);

      // Выводим все найденные элементы на странице для отладки
      const elements = await page.evaluate(() => {
        return {
          usernameExists: !!document.querySelector("#username"),
          passwordExists: !!document.querySelector("#password"),
          html: document.documentElement.innerHTML,
        };
      });
      console.log("Состояние элементов на странице:", elements);
    }

    // Делаем скриншот для отладки
    await page.screenshot({ path: "debug.png", fullPage: true });

    // Ищем Turnstile элемент
    const turnstileElement = await page
      .locator('iframe[src*="challenges.cloudflare.com"]')
      .first();
    if (turnstileElement) {
      const siteKey = await turnstileElement.getAttribute("data-sitekey");
      if (siteKey) {
        console.log("Found Turnstile sitekey:", siteKey);

        const token = await getTurnstileSolution(
          config.captchaApiKey,
          siteKey,
          page.url()
        );

        if (token) {
          // Вставляем токен и вызываем callback
          await page.evaluate((token) => {
            const input = document.querySelector(
              'input[name="cf-turnstile-response"]'
            );
            if (input) {
              (input as HTMLInputElement).value = token;
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
            if (window.tsCallback) {
              window.tsCallback(token);
            }
          }, token);
        }
      }
    }

    // Ждем перед закрытием
    await page.waitForTimeout(100000);
  } catch (error) {
    console.error("Произошла ошибка:", error);
    if (page) {
      await page.screenshot({ path: "error.png", fullPage: true });
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
