import { createWorker, PSM } from "tesseract.js";
import { ensureDir } from "./fs-utils.mjs";

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createOcrRunner(config) {
  let workerPromise = null;

  async function getWorker() {
    if (!workerPromise) {
      workerPromise = (async () => {
        await ensureDir(config.ocr.cacheDir);
        const languages = Array.isArray(config.ocr.languages)
          ? config.ocr.languages.join("+")
          : String(config.ocr.languages || "chi_sim+eng");
        const worker = await createWorker(languages, 1, {
          cachePath: config.ocr.cacheDir
        });
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
          preserve_interword_spaces: "1"
        });
        return worker;
      })();
    }
    return workerPromise;
  }

  return {
    async recognize(imagePath) {
      if (!config.ocr.enabled) {
        return {
          ok: false,
          skipped: true,
          text: "",
          error: "OCR is disabled."
        };
      }

      try {
        const worker = await getWorker();
        const result = await worker.recognize(imagePath);
        const text = cleanText(result.data?.text);
        return {
          ok: Boolean(text),
          skipped: false,
          text,
          confidence: result.data?.confidence ?? null,
          error: text ? "" : "No text recognized."
        };
      } catch (error) {
        return {
          ok: false,
          skipped: false,
          text: "",
          error: error.message
        };
      }
    },

    async close() {
      if (!workerPromise) return;
      const worker = await workerPromise.catch(() => null);
      workerPromise = null;
      if (worker) await worker.terminate().catch(() => {});
    }
  };
}
