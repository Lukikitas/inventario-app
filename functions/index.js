const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

/** ID de restaurante en la URL del reporte SIR (override con env SIR_RESTAURANTE_ID al deploy). */
const SIR_RESTAURANTE_ID = process.env.SIR_RESTAURANTE_ID || "19";

/**
 * Parsea respuesta HTTP de sirLogin: siempre JSON esperado; si no, error claro.
 */
async function readSirLoginResponse(response) {
  const rawBody = await response.text();
  if (!rawBody || !rawBody.trim()) {
    return { _parseError: true, status: response.status, message: "Respuesta vacía de sirLogin." };
  }
  try {
    return JSON.parse(rawBody);
  } catch (e) {
    logger.error("sirLogin no devolvió JSON", {
      status: response.status,
      snippet: rawBody.slice(0, 400),
    });
    return {
      _parseError: true,
      status: response.status,
      message: `SIR/sirLogin respondió no-JSON (HTTP ${response.status}).`,
      snippet: rawBody.slice(0, 200),
    };
  }
}

function extractSirLoginErrorMessage(responseData, httpStatus) {
  if (!responseData || responseData._parseError) {
    return (
      responseData?.message ||
      `Error HTTP ${httpStatus} desde sirLogin.` + (responseData?.snippet ? ` ${responseData.snippet}` : "")
    );
  }
  if (typeof responseData.error === "string") return responseData.error;
  if (responseData.error && typeof responseData.error.message === "string") {
    return responseData.error.message;
  }
  return `Proxy target returned status: ${httpStatus}`;
}

exports.proxySirLogin = onCall({ region: "southamerica-west1" }, async (request) => {
  const { user, password, fechaInicio, fechaFin } = request.data;

  if (!user || !password) {
    throw new HttpsError(
      "invalid-argument",
      'The function must be called with "user" and "password" arguments.'
    );
  }

  const sirLoginUrl =
    "https://southamerica-west1-mi-app-inventario-e639f.cloudfunctions.net/sirLogin";

  try {
    const payload = { user, password, fechaInicio, fechaFin };
    logger.info(`Proxying request for user: ${user} to ${sirLoginUrl}`);
    const response = await fetch(sirLoginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseData = await readSirLoginResponse(response);

    if (responseData._parseError) {
      throw new HttpsError("internal", extractSirLoginErrorMessage(responseData, response.status));
    }

    if (!response.ok) {
      const errorMessage = extractSirLoginErrorMessage(responseData, response.status);
      logger.error(`Error from target function: ${errorMessage}`);
      throw new HttpsError("internal", errorMessage, responseData);
    }

    return responseData;
  } catch (error) {
    logger.error("Error in proxySirLogin:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      "internal",
      error.message || "An unexpected error occurred in the proxy function."
    );
  }
});

exports.sirLogin = onRequest(
  {
    region: "southamerica-west1",
    memory: "2GiB",
    timeoutSeconds: 300,
    cors: true,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const { user, password, fechaInicio, fechaFin } = req.body;

    if (!user || !password) {
      return res.status(400).json({
        error: { message: 'The function must be called with "user" and "password" arguments.' },
      });
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
      page.setDefaultNavigationTimeout(240000);
      await page.goto("https://sir.kfc.com.ar/", { waitUntil: "networkidle0" });
      logger.info("Page loaded. Filling form.");

      await page.type('input[name="txtusuario"]', user);
      await page.type('input[name="txtclave"]', password);
      logger.info("Form filled, attempting to click login button.");

      const loginSelectors = [
        'input[type="image"][src*="aceptar"]',
        'input[type="image"][src*="Aceptar"]',
        'input[type="submit"]',
        'button[type="submit"]',
      ];
      let clicked = false;
      for (const sel of loginSelectors) {
        const handle = await page.$(sel);
        if (handle) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle0", timeout: 120000 }).catch(() => null),
            handle.click(),
          ]);
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        throw new Error("No se encontró control de envío del login en SIR.");
      }

      const pageContent = await page.content();
      const newUrl = page.url();

      if (
        newUrl.toLowerCase().includes("index.php") ||
        pageContent.toLowerCase().includes("clave incorrecta")
      ) {
        logger.error("Login failed. URL did not change or error message found.");
        return res.status(401).json({ error: "Login failed. Please check your credentials." });
      }

      logger.info(`Login successful. Navigated to ${newUrl}, now clicking the main button.`);
      const principalBtn = await page.$('input[name="btnprincipal"]');
      if (principalBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle0", timeout: 120000 }).catch(() => null),
          principalBtn.click(),
        ]);
      }

      const finalUrl = page.url();
      logger.info(`After login flow, landed on ${finalUrl}`);

      if (fechaInicio && fechaFin) {
        const formattedFechaI = fechaInicio.split("-").reverse().join("/");
        const formattedFechaF = fechaFin.split("-").reverse().join("/");

        const reportUrl = `https://sir.kfc.com.ar/inventarios/mdi/reporte_mdi.php?accion=Reporte&restaurante=${encodeURIComponent(
          SIR_RESTAURANTE_ID
        )}&fechaI=${encodeURIComponent(formattedFechaI)}&fechaF=${encodeURIComponent(formattedFechaF)}`;
        logger.info(`Navigating to report URL: ${reportUrl}`);

        await page.goto(reportUrl, { waitUntil: "networkidle0", timeout: 120000 });

        const reportData = await page.evaluate(() => {
          const table =
            document.querySelector("table.tabla") ||
            document.querySelector(".tabla") ||
            document.querySelector("table");
          if (!table) return [];

          let headerCells = Array.from(table.querySelectorAll('tr[bgcolor="#666666"] td'));
          if (!headerCells.length) {
            const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
            if (headerRow) {
              headerCells = Array.from(headerRow.querySelectorAll("th, td"));
            }
          }
          const headers = headerCells.map((h) => h.innerText.trim()).filter(Boolean);
          if (!headers.length) return [];

          const dataRows = Array.from(
            table.querySelectorAll('tbody tr, tr[bgcolor="#FFFFFF"], tr[bgcolor="#E6E6E6"]')
          ).filter((row) => {
            const cells = row.querySelectorAll("td");
            return cells.length > 0;
          });

          const parseNum = (text) => {
            const t = String(text).trim();
            if (!t || t.includes("/")) return NaN;
            if (t.includes(",")) return parseFloat(t.replace(/\./g, "").replace(",", "."));
            return parseFloat(t.replace(/,/g, "."));
          };

          return dataRows.map((row) => {
            const cells = Array.from(row.querySelectorAll("td"));
            const rowData = {};
            headers.forEach((header, index) => {
              if (cells[index]) {
                const text = cells[index].innerText.trim();
                const numberVal = parseNum(text);
                rowData[header] = !isNaN(numberVal) && text && !text.includes("/") ? numberVal : text;
              }
            });
            return rowData;
          });
        });

        logger.info(`Scraped ${reportData.length} items from the report.`);
        return res.status(200).json({ status: "success", report: reportData });
      }

      return res.status(200).json({
        status: "success",
        message: `Login successful! Landed on page: ${await page.title()}`,
        url: finalUrl,
      });
    } catch (error) {
      logger.error("Error during Puppeteer execution:", error);
      return res.status(500).json({
        error: { message: `An error occurred during the process: ${error.message}` },
      });
    } finally {
      if (browser !== null) {
        await browser.close();
      }
    }
  }
);
