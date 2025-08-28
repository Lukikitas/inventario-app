const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chrome-aws-lambda");
admin.initializeApp();

exports.proxySirLogin = onCall(async (request) => {
  const { user, password } = request.data;

  if (!user || !password) {
    throw new HttpsError('invalid-argument', 'The function must be called with "user" and "password" arguments.');
  }

  // IMPORTANT: The URL must match the region and project ID of the deployed function.
  const sirLoginUrl = 'https://southamerica-east1-mi-app-inventario-e639f.cloudfunctions.net/sirLogin';

  try {
    logger.info(`Proxying request for user: ${user} to ${sirLoginUrl}`);
    const response = await fetch(sirLoginUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ user, password }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      const errorMessage = responseData.error ? responseData.error.message : `Proxy target returned status: ${response.status}`;
      logger.error(`Error from target function: ${errorMessage}`);
      throw new HttpsError('internal', errorMessage, responseData);
    }

    return responseData;

  } catch (error) {
    logger.error('Error in proxySirLogin:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'An unexpected error occurred in the proxy function.');
  }
});

exports.sirLogin = onRequest({
  memory: '1GiB',
  timeoutSeconds: 60,
  cors: ["https://lukikitas.github.io"],
}, async (req, res) => {
  if (req.method !== 'POST') {
    // The 'cors' option should handle OPTIONS preflight requests automatically.
    // This check is for other methods.
    return res.status(405).send('Method Not Allowed');
  }

  const { user, password } = req.body;

  if (!user || !password) {
    return res.status(400).json({ error: { message: 'The function must be called with "user" and "password" arguments.' } });
  }

  logger.info(`Attempting Puppeteer login for user: ${user}`);

  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto('https://sir.kfc.com.ar/', { waitUntil: 'networkidle0' });
    logger.info("Page loaded. Filling form.");

    await page.type('input[name="txtusuario"]', user);
    await page.type('input[name="txtclave"]', password);
    logger.info("Form filled, attempting to click login button.");

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('input[type="image"][src*="aceptar.png"]')
    ]);

    const pageContent = await page.content();
    const newUrl = page.url();

    if (newUrl.toLowerCase().includes('index.php') || pageContent.toLowerCase().includes('clave incorrecta')) {
        logger.error("Login failed. URL did not change or error message found.");
        return res.status(401).json({ error: { message: 'Login failed. Please check your credentials.' } });
    }

    logger.info(`Login successful. Navigated to ${newUrl}`);
    const pageTitle = await page.title();

    return res.status(200).json({
      status: "success",
      message: `Login successful! Landed on page: ${pageTitle}`,
      url: newUrl
    });

  } catch (error) {
    logger.error("Error during Puppeteer execution:", error);
    return res.status(500).json({ error: { message: `An error occurred during the process: ${error.message}` } });
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
});
