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
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--disable-dev-shm-usage",
      "--disable-browser-side-navigation",
      "--disable-gpu",
      "--ignore-certificate-errors",
      "--enable-features=NetworkService",
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
      geolocation: { longitude: 76.9286, latitude: 43.2567 }, // Координаты Алматы
      permissions: ["geolocation"],
      // Эмулируем реальный браузер
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      javaScriptEnabled: true,
      acceptDownloads: true,
    });

    // Добавляем эмуляцию плагинов и других свойств браузера
    await context.addInitScript(() => {
      // Скрываем следы автоматизации
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

      // Добавляем фейковые языки
      Object.defineProperty(navigator, "languages", {
        get: () => ["ru-RU", "ru", "en-US", "en"],
      });

      // Эмулируем WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) {
          return "Intel Inc.";
        }
        if (parameter === 37446) {
          return "Intel(R) UHD Graphics";
        }
        return getParameter.apply(this, [parameter]);
      };
    });

    page = await context.newPage();

    // Добавляем случайные движения мыши
    await page.mouse.move(Math.random() * 1920, Math.random() * 1080, {
      steps: 50,
    });

    console.log("Открываем страницу...");
    await page.goto("https://visa.vfsglobal.com/kaz/ru/bgr/login", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // Ждем полной загрузки страницы
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Принимаем куки
    try {
      const cookieButton = await page.getByRole("button", {
        name: "Согласиться с использованием всех файлов cookie",
      });
      if (cookieButton) {
        await cookieButton.hover();
        await page.waitForTimeout(500);
        await cookieButton.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log("Не удалось найти кнопку принятия cookie");
    }

    // Пытаемся найти и заполнить поля формы
    try {
      console.log("Ищем поля формы...");

      // Ждем появления формы
      await page.waitForTimeout(5000);

      // Пробуем разные селекторы для email
      const emailSelectors = [
        'input[formcontrolname="username"]',
        'input[type="email"]',
        'input[type="text"]',
        "#username",
        '[name="username"]',
        ".mat-input-element",
      ];

      let emailInput = null;
      for (const selector of emailSelectors) {
        try {
          emailInput = await page.waitForSelector(selector, {
            timeout: 5000,
            state: "visible",
          });
          if (emailInput) {
            console.log(`Найдено поле email по селектору: ${selector}`);
            break;
          }
        } catch (e) {
          console.log(`Не найдено поле email по селектору: ${selector}`);
        }
      }

      if (emailInput) {
        // Эмулируем человеческое поведение
        await page.mouse.move(
          Math.random() * 100 + 200,
          Math.random() * 100 + 200
        );
        await page.waitForTimeout(500);

        // Пробуем разные способы ввода
        try {
          await emailInput.click({ force: true });
          await page.waitForTimeout(500);
          await emailInput.fill(config.email);
        } catch {
          await page.evaluate((email) => {
            const input = document.querySelector(
              'input[formcontrolname="username"]'
            ) as HTMLInputElement;
            if (input) {
              input.value = email;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }, config.email);
        }

        console.log("Email введен");
      }

      await page.waitForTimeout(2000);

      // Пробуем разные селекторы для пароля
      const passwordSelectors = [
        'input[formcontrolname="password"]',
        'input[type="password"]',
        "#password",
        '[name="password"]',
      ];

      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          passwordInput = await page.waitForSelector(selector, {
            timeout: 5000,
            state: "visible",
          });
          if (passwordInput) {
            console.log(`Найдено поле пароля по селектору: ${selector}`);
            break;
          }
        } catch (e) {
          console.log(`Не найдено поле пароля по селектору: ${selector}`);
        }
      }

      if (passwordInput) {
        // Эмулируем человеческое поведение
        await page.mouse.move(
          Math.random() * 100 + 200,
          Math.random() * 100 + 300
        );
        await page.waitForTimeout(500);

        // Пробуем разные способы ввода
        try {
          await passwordInput.click({ force: true });
          await page.waitForTimeout(500);
          await passwordInput.fill(config.password);
        } catch {
          await page.evaluate((password) => {
            const input = document.querySelector(
              'input[formcontrolname="password"]'
            ) as HTMLInputElement;
            if (input) {
              input.value = password;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }, config.password);
        }

        console.log("Пароль введен");
      }

      // Делаем скриншот для проверки
      await page.screenshot({ path: "form-filled.png", fullPage: true });

      // Выводим состояние формы
      const formState = await page.evaluate(() => {
        const emailInput = document.querySelector(
          'input[formcontrolname="username"]'
        ) as HTMLInputElement;
        const passwordInput = document.querySelector(
          'input[formcontrolname="password"]'
        ) as HTMLInputElement;
        return {
          emailValue: emailInput?.value || "не найдено",
          passwordValue: passwordInput?.value ? "***" : "не найдено",
          emailVisible: emailInput?.offsetParent !== null,
          passwordVisible: passwordInput?.offsetParent !== null,
        };
      });

      console.log("Состояние формы:", formState);
    } catch (e) {
      console.log("Ошибка при заполнении формы:", e);
      await page.screenshot({ path: "form-error.png", fullPage: true });
    }

    // Ждем перед закрытием
    await page.waitForTimeout(30000);
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
