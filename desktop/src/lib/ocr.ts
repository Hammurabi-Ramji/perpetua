/**
 * Fully offline screenshot-to-fields extraction for the license form.
 *
 * Runs Tesseract OCR entirely inside the app (worker/core/lang data are vendored
 * under `static/tesseract` and `static/tessdata` — see README note in that folder)
 * so no image or extracted text ever leaves the device.
 */
import { createWorker } from 'tesseract.js';

export interface ExtractedLicenseFields {
	licenseKey: string | null;
	purchaseDate: string | null;
	expiryDate: string | null;
	amount: string | null;
	rawText: string;
}

const MONTHS: Record<string, string> = {
	jan: '01',
	feb: '02',
	mar: '03',
	apr: '04',
	may: '05',
	jun: '06',
	jul: '07',
	aug: '08',
	sep: '09',
	oct: '10',
	nov: '11',
	dec: '12'
};

function pad2(value: string | number) {
	return String(value).padStart(2, '0');
}

/** Normalizes one matched date string to the `YYYY-MM-DD` shape HTML date inputs require. */
function toIsoDate(raw: string): string | null {
	const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (isoMatch) {
		return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
	}

	const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (slashMatch) {
		const [, month, day, year] = slashMatch;
		return `${year}-${pad2(month)}-${pad2(day)}`;
	}

	const textMatch = raw.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
	if (textMatch) {
		const [, monthName, day, year] = textMatch;
		const month = MONTHS[monthName.slice(0, 3).toLowerCase()];
		if (month) {
			return `${year}-${month}-${pad2(day)}`;
		}
	}

	return null;
}

const DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\b/;

function findLabeledDate(text: string, labels: RegExp): string | null {
	for (const line of text.split(/\r?\n/)) {
		if (labels.test(line)) {
			const match = line.match(DATE_PATTERN);
			if (match) {
				const iso = toIsoDate(match[1]);
				if (iso) return iso;
			}
		}
	}
	return null;
}

function findLicenseKey(text: string): string | null {
	const labeled = text.match(/(?:license\s*key|serial(?:\s*number)?|activation\s*code|key)\s*[:#]\s*([A-Za-z0-9-]{8,})/i);
	if (labeled) return labeled[1].trim();

	const generic = text.match(/\b[A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8}){2,7}\b/);
	return generic ? generic[0] : null;
}

function findAmount(text: string): string | null {
	for (const line of text.split(/\r?\n/)) {
		if (/\b(total|price|amount|paid)\b/i.test(line)) {
			const match = line.match(/\$\s?\d+(?:,\d{3})*(?:\.\d{2})?/);
			if (match) return match[0].replace(/\s+/, '');
		}
	}
	return null;
}

let workerPromise: ReturnType<typeof createWorker> | null = null;

function getWorker() {
	if (!workerPromise) {
		// If init fails (e.g. a transient asset load hiccup), don't cache the
		// rejection forever — clear it so the next upload gets a fresh attempt
		// instead of every future OCR call failing identically for the rest of
		// the session.
		workerPromise = createWorker('eng', 1, {
			workerPath: '/tesseract/worker.min.js',
			corePath: '/tesseract',
			langPath: '/tessdata'
		}).catch((error) => {
			workerPromise = null;
			throw error;
		});
	}
	return workerPromise;
}

export async function extractLicenseFieldsFromImage(file: File): Promise<ExtractedLicenseFields> {
	const worker = await getWorker();
	const {
		data: { text }
	} = await worker.recognize(file);

	return {
		licenseKey: findLicenseKey(text),
		purchaseDate: findLabeledDate(text, /purchase|order|bought/i),
		expiryDate: findLabeledDate(text, /expir|valid\s*(until|through)/i),
		amount: findAmount(text),
		rawText: text.trim()
	};
}
