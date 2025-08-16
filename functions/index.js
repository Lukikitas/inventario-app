const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer-core");
const chromium = require("chrome-aws-lambda");

admin.initializeApp();

// It's good practice to set memory and timeout for heavy functions.
// Puppeteer needs more than the default memory.
exports.sirLogin = onCall({
  memory: '1GiB',
  timeoutSeconds: 60,
}, async (request) => {
  const { user, password } = request.data;

  if (!user || !password) {
    // Throwing an HttpsError so the client gets a specific error code.
    throw new onCall.HttpsError('invalid-argument', 'The function must be called with "user" and "password" arguments.');
  }

  logger.info(`Attempting Puppeteer login for user: ${user}`);

  let browser = null;
  try {
    // Launch the browser using the serverless-compatible Chromium
    browser = await puppeteer.launch({
      executablePath: await chromium.executablePath,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Navigate to the login page and wait for it to be fully loaded
    await page.goto('https://sir.kfc.com.ar/', { waitUntil: 'networkidle0' });

    logger.info("Page loaded. Filling form.");

    // Fill and submit the form
    await page.type('input[name="txtusuario"]', user);
    await page.type('input[name="txtclave"]', password);

    logger.info("Form filled, attempting to click login button.");

    // Using Promise.all to prevent a race condition where the script
    // might try to check for the new page before the navigation is complete.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('input[type="image"][src*="aceptar.png"]')
    ]);

    const pageContent = await page.content();
    const newUrl = page.url();

    // Check if the login failed by looking for common failure indicators.
    if (newUrl.toLowerCase().includes('index.php') || pageContent.toLowerCase().includes('clave incorrecta')) {
        logger.error("Login failed. URL did not change or error message found.");
        throw new onCall.HttpsError('permission-denied', 'Login failed. Please check your credentials.');
    }

    logger.info(`Login successful. Navigated to ${newUrl}`);

    // --- DATA EXTRACTION STAGE (Placeholder) ---
    // Here we would navigate to the data page and scrape it.
    // This part requires the user to provide the URL and the structure of the data.
    // For now, we'll just return the title of the page we landed on as proof of success.
    const pageTitle = await page.title();

    return {
      status: "success",
      message: `Login successful! Landed on page: ${pageTitle}`,
      url: newUrl
    };

  } catch (error) {
    logger.error("Error during Puppeteer execution:", error);
    // If we threw a specific HttpsError, rethrow it. Otherwise, wrap it.
    if (error.name === 'HttpsError') {
      throw error;
    }
    throw new onCall.HttpsError('internal', `An error occurred during the process: ${error.message}`);
  } finally {
    // Ensure the browser is always closed, even if an error occurred.
    if (browser !== null) {
      await browser.close();
    }
  }
});
