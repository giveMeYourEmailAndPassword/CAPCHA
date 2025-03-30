import { chromium } from "playwright";
import { config } from "./config";

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500, // Увеличиваем задержку между действиями
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // Переходим на страницу логина
    console.log("Открываем страницу...");
    await page.goto("https://visa.vfsglobal.com/kaz/ru/bgr/login");

    // Ждем загрузки страницы
    console.log("Ждем загрузки страницы...");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000); // Ждем 5 секунд

    // Пробуем найти и заполнить поля
    console.log("Пробуем заполнить поля...");

    // Пробуем разные селекторы для поля email
    try {
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.type('input[type="email"]', config.email, { delay: 100 });
    } catch {
      try {
        await page.waitForSelector("#mat-input-0", { timeout: 10000 });
        await page.type("#mat-input-0", config.email, { delay: 100 });
      } catch (e) {
        console.log("Не удалось найти поле email");
      }
    }

    // Ждем немного перед заполнением пароля
    await page.waitForTimeout(2000);

    // Пробуем разные селекторы для поля пароля
    try {
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      await page.type('input[type="password"]', config.password, {
        delay: 100,
      });
    } catch {
      try {
        await page.waitForSelector("#mat-input-1", { timeout: 10000 });
        await page.type("#mat-input-1", config.password, { delay: 100 });
      } catch (e) {
        console.log("Не удалось найти поле пароля");
      }
    }

    // Ждем 10 секунд перед закрытием
    console.log("Ждем 10 секунд...");
    await page.waitForTimeout(10000);
  } catch (error) {
    console.error("Произошла ошибка:", error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
