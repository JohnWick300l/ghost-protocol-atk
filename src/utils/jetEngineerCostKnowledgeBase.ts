// GHOST PROTOCOL — Jet Engineer Ultraviolette Parts, Labour & Service Cost Knowledge Base Engine
import rawCostKnowledgeBaseJson from '../data/jet_engineer_cost_knowledge_base.json' with { type: 'json' };

export const JET_ENGINEER_COST_KB_VERSION = '1.0.0';
export const JET_ENGINEER_COST_KB_LAST_UPDATED = '2026-10-23';

export const JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE =
  'Sorry pilot, I am still learning. Please add this information in my database by pressing TRAIN button allowing me to learn from your inputs , whenever you know this information';

export interface CostPartItem {
  part_number: string | null;
  name: string;
  aliases: string[];
  quantity: number;
  total_price_inr: number;
  category: 'part' | 'fluid' | 'accessory';
}

export interface CostLabourItem {
  operation_code: string | null;
  operation: string;
  aliases: string[];
  total_price_inr: number;
}

export interface CostServiceInterval {
  description: string;
  interval_km: number;
  time_limit_days: number;
  display_text: string;
}

export interface CostKnowledgeRecord {
  record_id: string;
  document_type: string;
  status: string;
  vehicle_model: string;
  vehicle_variant?: string;
  document_date: string | null;
  odometer_km?: number;
  service_interval?: CostServiceInterval;
  parts: CostPartItem[];
  fluids: CostPartItem[];
  accessories: CostPartItem[];
  labour: CostLabourItem[];
  document_totals_inr: Record<string, number>;
  notes: string[];
  source_confidence: string;
}

export interface IndexedPartEntry {
  id: string;
  record: CostKnowledgeRecord;
  item: CostPartItem;
  matchingLabour: CostLabourItem | null;
  modelKey: 'F77' | 'X47';
  isEstimate: boolean;
  normName: string;
  normPartNumber: string;
  normAliases: string[];
  searchTokens: string[];
  familyKey: string;
}

export interface IndexedLabourEntry {
  id: string;
  record: CostKnowledgeRecord;
  labour: CostLabourItem;
  matchingPart: CostPartItem | null;
  modelKey: 'F77' | 'X47';
  isEstimate: boolean;
  normOperation: string;
  normCode: string;
  normAliases: string[];
  searchTokens: string[];
}

export interface JetEngineerCostKnowledgeIndex {
  databaseName: string;
  schemaVersion: string;
  lastUpdated: string;
  currency: string;
  currencySymbol: string;
  records: CostKnowledgeRecord[];
  partsIndex: IndexedPartEntry[];
  labourIndex: IndexedLabourEntry[];
  unitemisedRecords: CostKnowledgeRecord[];
  indexedAt: number;
}

/**
 * Formats a numeric INR amount using Indian numbering system (lakhs/crores) with 2 decimals.
 * Example: 105 -> "₹105.00", 4823.25 -> "₹4,823.25", 162929.42 -> "₹1,62,929.42"
 */
export function formatInrAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0.00';
  const fixed = Math.abs(amount).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const lastThree = intPart.slice(-3);
  const otherNumbers = intPart.slice(0, -3);
  const formattedInt =
    otherNumbers !== ''
      ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
      : lastThree;
  return `${amount < 0 ? '-' : ''}₹${formattedInt}.${decPart}`;
}

function normalizeText(input: string | null | undefined): string {
  return String(input || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\br\s*and\s*r\b/g, 'removal and replacement')
    .replace(/\bcenter\b/g, 'centre')
    .replace(/\bhandle\s+bar\b/g, 'handlebar')
    .replace(/\bo[\s-]*ring\b/g, 'oring')
    .replace(/\bbull\s+bar\b/g, 'bullbar')
    .replace(/\bhead\s+light\b/g, 'headlamp')
    .replace(/\bhead\s+lamp\b/g, 'headlamp')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic mapping of exact part numbers to their exact applicable labour operation
 * within the same source document. Never pairs a vaguely similar labour line.
 */
const EXACT_PART_TO_LABOUR_MAP: Record<string, string> = {
  // Record 1: F77-PAID-SERVICE-2026-08-16
  'F77-PAID-SERVICE-2026-08-16:SRV_VX184330': 'ME-F77-063', // Chain Slider
  'F77-PAID-SERVICE-2026-08-16:SRV_VX160170': 'ME-X47-048', // Magnetic Drain Plug

  // Record 2: X47-PARTS-INVOICE-UNDATED
  'X47-PARTS-INVOICE-UNDATED:SRV_VQ180260TR': 'PL-X47-062', // X47 Tank Cover Trim LH DL Assembly
  'X47-PARTS-INVOICE-UNDATED:SRV_VQ170060': 'ME-X47-122', // Handlebar Tube
  'X47-PARTS-INVOICE-UNDATED:SRV_VX170190': 'ME-F77-010', // Bar End
  'X47-PARTS-INVOICE-UNDATED:SRV_VX190020': 'EE-X47-004', // Rear Indicator Assembly LH
  'X47-PARTS-INVOICE-UNDATED:SRV_VQ180700': 'EE-X47-018', // ADAS Mirror Assembly LH
  'X47-PARTS-INVOICE-UNDATED:SRV_VQ180440SSAB': 'PL-X47-065', // X47 Side Panel TR LH DL Assembly
  'X47-PARTS-INVOICE-UNDATED:SRV_VQ180480': 'PL-X47-035', // Belly Panel Centre

  // Record 3: X47-RECON-ESTIMATE-2026-10-23
  'X47-RECON-ESTIMATE-2026-10-23:VQ180260': 'TAN-00001', // Tank Cover LH
  'X47-RECON-ESTIMATE-2026-10-23:VQ180440': 'SID-00002', // Side Panel LH Centre
  'X47-RECON-ESTIMATE-2026-10-23:VQ180220': 'FR0-00001', // Tank Cover Front LH
  'X47-RECON-ESTIMATE-2026-10-23:VQ270860': 'X47-00005', // Bullbar X47
  'X47-RECON-ESTIMATE-2026-10-23:VQ270850T': 'KNU-00002', // Knuckle Guard Set
  'X47-RECON-ESTIMATE-2026-10-23:VQ180520': 'SID-00004', // Panel Bottom LH
  'X47-RECON-ESTIMATE-2026-10-23:VQ120210': 'FOR-00004' // Fork Leg Assembly LH - Gold
};

function resolveFamilyKey(partName: string): string {
  const n = normalizeText(partName);
  if (n.includes('knuckle guard')) return 'knuckle_guard';
  if (n.includes('tank cover')) return 'tank_cover';
  if (n.includes('belly panel')) return 'belly_panel';
  if (n.includes('side panel') || n === 'panel bottom lh') return 'side_panel';
  if (n.includes('indicator')) return 'indicator';
  if (n.includes('bullbar')) return 'bullbar';
  return n;
}

let cachedKnowledgeIndex: JetEngineerCostKnowledgeIndex | null = null;

/**
 * Parses, validates, and indexes `jet_engineer_cost_knowledge_base.json` once at load time.
 * Avoids duplicate indexing when Jet Engineer initializes more than once.
 */
export function getJetEngineerCostKnowledgeIndex(): JetEngineerCostKnowledgeIndex {
  if (cachedKnowledgeIndex) {
    return cachedKnowledgeIndex;
  }

  const raw: any = rawCostKnowledgeBaseJson || {};
  const rawRecords: any[] = Array.isArray(raw.records) ? raw.records : [];

  const records: CostKnowledgeRecord[] = [];
  const partsIndex: IndexedPartEntry[] = [];
  const labourIndex: IndexedLabourEntry[] = [];
  const unitemisedRecords: CostKnowledgeRecord[] = [];

  for (const r of rawRecords) {
    if (!r || typeof r.record_id !== 'string') continue;

    const sanitizePartList = (
      arr: any[],
      category: 'part' | 'fluid' | 'accessory'
    ): CostPartItem[] => {
      if (!Array.isArray(arr)) return [];
      const result: CostPartItem[] = [];
      for (const item of arr) {
        if (!item || typeof item.name !== 'string') continue;
        const price = Number(item.total_price_inr);
        if (!Number.isFinite(price)) continue;
        result.push({
          part_number: typeof item.part_number === 'string' ? item.part_number.trim() : null,
          name: item.name.trim(),
          aliases: Array.isArray(item.aliases)
            ? item.aliases.filter((a: any) => typeof a === 'string').map((a: string) => a.trim())
            : [],
          quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 1,
          total_price_inr: price,
          category
        });
      }
      return result;
    };

    const sanitizeLabourList = (arr: any[]): CostLabourItem[] => {
      if (!Array.isArray(arr)) return [];
      const result: CostLabourItem[] = [];
      for (const l of arr) {
        if (!l || typeof l.operation !== 'string') continue;
        const price = Number(l.total_price_inr);
        if (!Number.isFinite(price)) continue;
        result.push({
          operation_code: typeof l.operation_code === 'string' ? l.operation_code.trim() : null,
          operation: l.operation.trim(),
          aliases: Array.isArray(l.aliases)
            ? l.aliases.filter((a: any) => typeof a === 'string').map((a: string) => a.trim())
            : [],
          total_price_inr: price
        });
      }
      return result;
    };

    const parts = sanitizePartList(r.parts, 'part');
    const fluids = sanitizePartList(r.fluids, 'fluid');
    const accessories = sanitizePartList(r.accessories, 'accessory');
    const labour = sanitizeLabourList(r.labour);

    const totals: Record<string, number> = {};
    if (r.document_totals_inr && typeof r.document_totals_inr === 'object') {
      for (const [k, v] of Object.entries(r.document_totals_inr)) {
        const num = Number(v);
        if (Number.isFinite(num)) {
          totals[k] = num;
        }
      }
    }

    const record: CostKnowledgeRecord = {
      record_id: r.record_id,
      document_type: String(r.document_type || 'unknown'),
      status: String(r.status || 'unknown'),
      vehicle_model: String(r.vehicle_model || 'Unknown'),
      vehicle_variant: r.vehicle_variant ? String(r.vehicle_variant) : undefined,
      document_date: typeof r.document_date === 'string' ? r.document_date : null,
      odometer_km: Number.isFinite(Number(r.odometer_km)) ? Number(r.odometer_km) : undefined,
      service_interval:
        r.service_interval && typeof r.service_interval === 'object'
          ? {
              description: String(r.service_interval.description || ''),
              interval_km: Number(r.service_interval.interval_km) || 0,
              time_limit_days: Number(r.service_interval.time_limit_days) || 0,
              display_text: String(r.service_interval.display_text || '')
            }
          : undefined,
      parts,
      fluids,
      accessories,
      labour,
      document_totals_inr: totals,
      notes: Array.isArray(r.notes)
        ? r.notes.filter((n: any) => typeof n === 'string')
        : [],
      source_confidence: String(r.source_confidence || 'unknown')
    };

    records.push(record);

    // Never index the unitemised ₹87,535 record into the parts or labour indices
    if (
      record.status === 'unitemised_amount_only' ||
      record.record_id === 'UNITEMISED-ESTIMATE-87535' ||
      record.source_confidence === 'low_for_itemisation'
    ) {
      unitemisedRecords.push(record);
      continue;
    }

    const modelUpper = record.vehicle_model.toUpperCase();
    const modelKey: 'F77' | 'X47' = modelUpper.includes('X47') ? 'X47' : 'F77';
    const isEstimate =
      record.document_type.includes('estimate') ||
      record.status.includes('estimate');

    const allPartItems = [...parts, ...fluids, ...accessories];
    const partByLabourCode = new Map<string, CostPartItem>();

    for (const item of allPartItems) {
      const mapKey = `${record.record_id}:${item.part_number || item.name}`;
      const matchedOpCode = EXACT_PART_TO_LABOUR_MAP[mapKey];
      const matchingLabour = matchedOpCode
        ? labour.find(l => l.operation_code === matchedOpCode) || null
        : null;

      if (matchedOpCode && matchingLabour) {
        partByLabourCode.set(matchedOpCode, item);
      }

      const normName = normalizeText(item.name);
      const normPartNumber = String(item.part_number || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const normAliases = item.aliases.map(a => normalizeText(a));
      const tokenSet = new Set<string>(
        `${normName} ${normAliases.join(' ')}`
          .split(/\s+/)
          .filter(w => w.length >= 2)
      );

      partsIndex.push({
        id: `${record.record_id}:${item.part_number || normName}`,
        record,
        item,
        matchingLabour,
        modelKey,
        isEstimate,
        normName,
        normPartNumber,
        normAliases,
        searchTokens: Array.from(tokenSet),
        familyKey: resolveFamilyKey(item.name)
      });
    }

    for (const l of labour) {
      const matchingPart = l.operation_code
        ? partByLabourCode.get(l.operation_code) || null
        : null;
      const normOperation = normalizeText(l.operation);
      const normCode = String(l.operation_code || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const normAliases = l.aliases.map(a => normalizeText(a));
      const tokenSet = new Set<string>(
        `${normOperation} ${normAliases.join(' ')}`
          .split(/\s+/)
          .filter(w => w.length >= 2)
      );

      labourIndex.push({
        id: `${record.record_id}:${l.operation_code || normOperation}`,
        record,
        labour: l,
        matchingPart,
        modelKey,
        isEstimate,
        normOperation,
        normCode,
        normAliases,
        searchTokens: Array.from(tokenSet)
      });
    }
  }

  cachedKnowledgeIndex = {
    databaseName: String(
      raw.database_name ||
        'Ghost Protocol Jet Engineer - Ultraviolette Parts and Labour Cost Knowledge Base'
    ),
    schemaVersion: String(raw.schema_version || JET_ENGINEER_COST_KB_VERSION),
    lastUpdated: JET_ENGINEER_COST_KB_LAST_UPDATED,
    currency: String(raw.currency || 'INR'),
    currencySymbol: String(raw.currency_symbol || '₹'),
    records,
    partsIndex,
    labourIndex,
    unitemisedRecords,
    indexedAt: Date.now()
  };

  return cachedKnowledgeIndex;
}

function formatPartEntryBlock(
  entry: IndexedPartEntry,
  options?: { labourOnlyFocus?: boolean }
): string {
  const { record, item, matchingLabour } = entry;
  const variantSuffix =
    record.vehicle_variant &&
    !record.vehicle_variant.toLowerCase().includes('not specified') &&
    !record.vehicle_model.toLowerCase().includes(record.vehicle_variant.toLowerCase())
      ? ` (${record.vehicle_variant})`
      : '';

  if (options?.labourOnlyFocus && matchingLabour) {
    return [
      `LABOUR: ${matchingLabour.operation}`,
      `Model: ${record.vehicle_model}${variantSuffix}`,
      `Labour charge: ${formatInrAmount(matchingLabour.total_price_inr)}`,
      `Part price (${item.name}): ${formatInrAmount(item.total_price_inr)}`,
      `Total (Part + Labour): ${formatInrAmount(item.total_price_inr + matchingLabour.total_price_inr)}`
    ].join('\n');
  }

  const lines: string[] = [
    `PART: ${item.name}`,
    `Model: ${record.vehicle_model}${variantSuffix}`,
    `Part price: ${formatInrAmount(item.total_price_inr)}`
  ];

  if (matchingLabour) {
    lines.push(
      `Labour: ${formatInrAmount(matchingLabour.total_price_inr)} — ${matchingLabour.operation}`
    );
    const combined = Number((item.total_price_inr + matchingLabour.total_price_inr).toFixed(2));
    lines.push(`Total (Part + Labour): ${formatInrAmount(combined)}`);
  } else {
    lines.push(
      'Labour: A separate labour charge for this exact part was not listed in the supplied records.'
    );
  }

  return lines.join('\n');
}

function formatStandaloneLabourBlock(entry: IndexedLabourEntry): string {
  const { record, labour, matchingPart } = entry;
  const lines: string[] = [
    `LABOUR: ${labour.operation}`,
    `Model: ${record.vehicle_model}`,
    `Labour charge: ${formatInrAmount(labour.total_price_inr)}`
  ];

  if (matchingPart) {
    lines.push(
      `Part price (${matchingPart.name}): ${formatInrAmount(matchingPart.total_price_inr)}`
    );
    lines.push(
      `Total (Part + Labour): ${formatInrAmount(matchingPart.total_price_inr + labour.total_price_inr)}`
    );
  }

  return lines.join('\n');
}

function formatF77ServiceRecordResponse(
  record: CostKnowledgeRecord,
  includeFullBreakdown: boolean
): string {
  const intervalText = record.service_interval
    ? `${record.service_interval.interval_km.toLocaleString('en-IN')} km / ${record.service_interval.time_limit_days} days`
    : '20,000 km / 720 days';
  const serviceLabour = record.labour.find(l =>
    l.operation.toLowerCase().includes('paid service')
  );
  const serviceLabourInr = serviceLabour ? serviceLabour.total_price_inr : 4823.25;

  const lines: string[] = [
    `SERVICE: ${record.service_interval?.description || '3rd paid service'}`,
    `Model: ${record.vehicle_model}`,
    `Service interval: ${intervalText}`,
    `Service labour charge: ${formatInrAmount(serviceLabourInr)}`
  ];

  if (includeFullBreakdown) {
    lines.push('');
    lines.push('Parts & Fluids:');
    for (const p of record.parts) {
      lines.push(`• ${p.name}: ${formatInrAmount(p.total_price_inr)}`);
    }
    for (const f of record.fluids) {
      lines.push(`• ${f.name}: ${formatInrAmount(f.total_price_inr)}`);
    }
    lines.push('');
    lines.push('Labour Operations:');
    for (const l of record.labour) {
      lines.push(`• ${l.operation}: ${formatInrAmount(l.total_price_inr)}`);
    }
    lines.push('');
    lines.push(
      `Total Invoice Amount: ${formatInrAmount(record.document_totals_inr.invoice_total_paid || 5332.0)}`
    );
  } else {
    lines.push(
      `Additional items on same service: Parts ${formatInrAmount(record.document_totals_inr.parts_subtotal || 308.47)}, Transmission Oil ${formatInrAmount(record.document_totals_inr.fluids_subtotal || 141.6)}, and specific R&R labour (${formatInrAmount(29.5)} Chain Slider + ${formatInrAmount(29.5)} Magnetic Drain Plug) — Total: ${formatInrAmount(record.document_totals_inr.invoice_total_paid || 5332.0)}`
    );
  }

  return lines.join('\n');
}

export interface CostKnowledgeQueryResult {
  handled: boolean;
  answer: string;
  source: string;
  matchedRecordIds: string[];
}

const STOP_WORDS = new Set([
  'what',
  'is',
  'the',
  'of',
  'an',
  'a',
  'for',
  'in',
  'on',
  'to',
  'and',
  'or',
  'how',
  'much',
  'does',
  'do',
  'cost',
  'costs',
  'price',
  'prices',
  'rate',
  'charge',
  'charges',
  'labour',
  'labor',
  'replacing',
  'replacement',
  'replace',
  'removal',
  'including',
  'with',
  'ultraviolette',
  'uv',
  'f77',
  'x47',
  'recon',
  'mach',
  'part',
  'parts',
  'inr',
  'rs',
  'rupees',
  'quote',
  'estimate',
  'invoice',
  'total',
  'combined',
  'amount'
]);

/**
 * Searches the Ultraviolette Parts, Labour & Service Cost Knowledge Base for a user query.
 * Returns `handled: true` when the query is a cost/price/labour/service-interval/part lookup,
 * or `handled: false` if the query is a general diagnostic/troubleshooting question.
 */
export function queryJetEngineerCostKnowledgeBase(
  rawQuery: string,
  contextModel: string = 'F77'
): CostKnowledgeQueryResult {
  const index = getJetEngineerCostKnowledgeIndex();
  const qRaw = String(rawQuery || '').trim();
  if (!qRaw) {
    return { handled: false, answer: '', source: '', matchedRecordIds: [] };
  }

  const normQ = normalizeText(qRaw);
  const rawAlnum = qRaw.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Detect explicit model mention in the query text itself
  const hasExplicitF77 = /\bf\s*77\b/i.test(qRaw);
  const hasExplicitX47 = /\bx\s*47\b/i.test(qRaw);
  const hasExplicitRecon = /\brecon\b/i.test(qRaw);

  const explicitModel: 'F77' | 'X47' | null =
    hasExplicitF77 && !hasExplicitX47
      ? 'F77'
      : hasExplicitX47 && !hasExplicitF77
      ? 'X47'
      : null;

  // Detect cost / price / labour / service-cost intent
  const hasCostKeyword =
    /\b(cost|costs|price|prices|pricing|how\s+much|labour|labor|charge|charges|rate|inr|rupees|rs\.?|invoice|estimate|quote|billed|20k\s+service|20,000\s*km|720\s*days|3rd\s+(paid\s+)?service|third\s+(paid\s+)?service|service\s+interval|service\s+cost|service\s+charge|r&r)\b/i.test(
      qRaw
    ) || qRaw.includes('₹');

  const isLabourFocusedQuery =
    /\b(labour|labor|r&r|removal\s+and\s+replacement)\b/i.test(qRaw) &&
    !/\bincluding\s+(labour|labor)\b/i.test(qRaw) &&
    !/\bpart\s+and\s+(labour|labor)\b/i.test(qRaw);

  // 1. Check if the user is specifically asking about the unitemised ₹87,535 estimate
  if (
    normQ.includes('87535') ||
    normQ.includes('87 535') ||
    normQ.includes('unitemised') ||
    normQ.includes('unitemized')
  ) {
    return {
      handled: true,
      source: 'Cost Knowledge Base',
      matchedRecordIds: [],
      answer: JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE
    };
  }

  // 2. Check for Service Interval / 20K Service / 3rd Paid Service queries
  const isServiceIntervalOr20kQuery =
    /\b(20k|20,000|20000|720\s*days|3rd\s+(paid\s+)?service|third\s+(paid\s+)?service|paid\s+service|service\s+cost|service\s+charge|service\s+interval|service\s+schedule|1st\s+service|2nd\s+service|4th\s+service|10k\s+service|5k\s+service)\b/i.test(
      qRaw
    );

  if (isServiceIntervalOr20kQuery) {
    const f77ServiceRecord = index.records.find(
      r => r.record_id === 'F77-PAID-SERVICE-2026-08-16'
    );

    if (explicitModel === 'X47') {
      return {
        handled: true,
        source: 'Cost Knowledge Base (Service Interval Lookup)',
        matchedRecordIds: [],
        answer: JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE
      };
    }

    if (
      /\b(1st|first|2nd|second|4th|fourth|5k|5,000|10k|10,000|15k|30k)\b/i.test(qRaw) &&
      !/\b(3rd|third|20k|20,000)\b/i.test(qRaw)
    ) {
      return {
        handled: true,
        source: 'Cost Knowledge Base (Service Interval Lookup)',
        matchedRecordIds: [],
        answer: JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE
      };
    }

    if (f77ServiceRecord) {
      const wantsFullTotal =
        /\b(total|complete|full|all\s+items|invoice\s+total|breakdown)\b/i.test(qRaw);
      return {
        handled: true,
        source: `Cost Knowledge Base (${f77ServiceRecord.record_id})`,
        matchedRecordIds: [f77ServiceRecord.record_id],
        answer: formatF77ServiceRecordResponse(f77ServiceRecord, wantsFullTotal)
      };
    }
  }

  // 3. Check for exact Part Number or Operation Code match
  for (const pEntry of index.partsIndex) {
    if (
      pEntry.normPartNumber &&
      pEntry.normPartNumber.length >= 6 &&
      rawAlnum.includes(pEntry.normPartNumber)
    ) {
      if (explicitModel && pEntry.modelKey !== explicitModel) {
        return {
          handled: true,
          source: 'Cost Knowledge Base',
          matchedRecordIds: [],
          answer: JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE
        };
      }
      return {
        handled: true,
        source: `Cost Knowledge Base (${pEntry.record.record_id})`,
        matchedRecordIds: [pEntry.record.record_id],
        answer: formatPartEntryBlock(pEntry, { labourOnlyFocus: isLabourFocusedQuery })
      };
    }
  }

  for (const lEntry of index.labourIndex) {
    if (
      lEntry.normCode &&
      lEntry.normCode.length >= 6 &&
      rawAlnum.includes(lEntry.normCode)
    ) {
      if (explicitModel && lEntry.modelKey !== explicitModel) {
        return {
          handled: true,
          source: 'Cost Knowledge Base',
          matchedRecordIds: [],
          answer: JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE
        };
      }
      return {
        handled: true,
        source: `Cost Knowledge Base (${lEntry.record.record_id})`,
        matchedRecordIds: [lEntry.record.record_id],
        answer: formatStandaloneLabourBlock(lEntry)
      };
    }
  }

  // 4. Score Parts & Standalone Labour Entries against the query
  const queryContentTokens = normQ
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  const hasDiagnosticOnlyTerms =
    /\b(soc|delta|balancing|derate|regen|monsoon|wet|bluetooth|ble|reboot|210\s*hz|flutter|warning\s+icon|cold\s+soak)\b/i.test(
      qRaw
    );
  if (hasDiagnosticOnlyTerms && !hasCostKeyword) {
    return { handled: false, answer: '', source: '', matchedRecordIds: [] };
  }

  const wantsLH = /\b(lh|left)\b/i.test(normQ);
  const wantsRH = /\b(rh|right)\b/i.test(normQ);
  const wantsFront = /\bfront\b/i.test(normQ);
  const wantsRear = /\brear\b/i.test(normQ);
  const wantsCentre = /\b(centre|center)\b/i.test(normQ);
  const wantsBottom = /\b(bottom|lower)\b/i.test(normQ);
  const wantsTrim = /\btrim\b/i.test(normQ);
  const wantsSet = /\bset\b/i.test(normQ);

  interface ScoredPart {
    entry: IndexedPartEntry;
    score: number;
    matchedTokens: number;
  }

  const scoredParts: ScoredPart[] = [];

  for (const entry of index.partsIndex) {
    let score = 0;
    let matchedTokens = 0;

    if (normQ.includes(entry.normName)) {
      score += 90 + entry.normName.length;
    }
    for (const alias of entry.normAliases) {
      if (alias && normQ.includes(alias)) {
        score += 85 + alias.length;
      }
    }

    for (const qt of queryContentTokens) {
      if (entry.searchTokens.includes(qt)) {
        matchedTokens += 1;
        score += 22;
      } else if (entry.searchTokens.some(st => st.startsWith(qt) || qt.startsWith(st))) {
        matchedTokens += 1;
        score += 12;
      }
    }

    if (score === 0) continue;

    const nonGenericTokens = queryContentTokens.filter(
      t => !['lh', 'rh', 'left', 'right', 'front', 'rear', 'assembly', 'set'].includes(t)
    );
    if (nonGenericTokens.length > 0) {
      const matchedNonGeneric = nonGenericTokens.filter(t =>
        entry.searchTokens.some(st => st === t || st.includes(t) || t.includes(st))
      );
      if (matchedNonGeneric.length === 0) {
        continue;
      }
    }

    const entryHasLH =
      entry.searchTokens.includes('lh') || entry.searchTokens.includes('left');
    const entryHasRH =
      entry.searchTokens.includes('rh') || entry.searchTokens.includes('right');
    const entryHasFront = entry.searchTokens.includes('front');
    const entryHasRear = entry.searchTokens.includes('rear');
    const entryHasCentre = entry.searchTokens.includes('centre');
    const entryHasBottom =
      entry.searchTokens.includes('bottom') || entry.searchTokens.includes('lower');
    const entryHasTrim = entry.searchTokens.includes('trim');

    if (wantsLH && entryHasRH && !entryHasLH) continue;
    if (wantsRH && entryHasLH && !entryHasRH) continue;
    if (wantsFront && entryHasRear && !entryHasFront) continue;
    if (wantsRear && entryHasFront && !entryHasRear) continue;

    if (wantsLH && entryHasLH) score += 20;
    if (wantsRH && entryHasRH) score += 20;
    if (wantsFront && entryHasFront) score += 20;
    if (wantsRear && entryHasRear) score += 20;
    if (wantsCentre && entryHasCentre) score += 25;
    if (wantsBottom && entryHasBottom) score += 25;
    if (wantsTrim && entryHasTrim) score += 25;
    if (wantsSet && entry.searchTokens.includes('set')) score += 25;

    if (
      hasExplicitRecon &&
      entry.record.vehicle_model.toLowerCase().includes('recon')
    ) {
      score += 25;
    }

    scoredParts.push({ entry, score, matchedTokens });
  }

  interface ScoredLabour {
    entry: IndexedLabourEntry;
    score: number;
  }
  const scoredLabours: ScoredLabour[] = [];
  for (const lEntry of index.labourIndex) {
    if (lEntry.labour.operation.toLowerCase().includes('paid service')) continue;
    let score = 0;
    if (normQ.includes(lEntry.normOperation)) {
      score += 95;
    }
    for (const alias of lEntry.normAliases) {
      if (alias && normQ.includes(alias)) {
        score += 85;
      }
    }
    for (const qt of queryContentTokens) {
      if (lEntry.searchTokens.includes(qt)) {
        score += 20;
      }
    }
    if (score >= 40) {
      scoredLabours.push({ entry: lEntry, score });
    }
  }

  scoredParts.sort((a, b) => b.score - a.score);
  scoredLabours.sort((a, b) => b.score - a.score);

  if (scoredParts.length === 0 && scoredLabours.length === 0) {
    if (hasCostKeyword) {
      return {
        handled: true,
        source: 'Cost Knowledge Base',
        matchedRecordIds: [],
        answer: JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE
      };
    }
    return { handled: false, answer: '', source: '', matchedRecordIds: [] };
  }

  const bestPartScore = scoredParts[0]?.score || 0;
  const bestLabourScore = scoredLabours[0]?.score || 0;
  if (!hasCostKeyword && bestPartScore < 65 && bestLabourScore < 65) {
    return { handled: false, answer: '', source: '', matchedRecordIds: [] };
  }

  if (
    scoredLabours.length > 0 &&
    !scoredLabours[0].entry.matchingPart &&
    scoredLabours[0].score > bestPartScore
  ) {
    const topLabour = scoredLabours[0].entry;
    if (explicitModel && topLabour.modelKey !== explicitModel) {
      return {
        handled: true,
        source: 'Cost Knowledge Base',
        matchedRecordIds: [],
        answer: JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE
      };
    }
    return {
      handled: true,
      source: `Cost Knowledge Base (${topLabour.record.record_id})`,
      matchedRecordIds: [topLabour.record.record_id],
      answer: formatStandaloneLabourBlock(topLabour)
    };
  }

  let modelFilteredParts = scoredParts;
  if (explicitModel) {
    modelFilteredParts = scoredParts.filter(sp => sp.entry.modelKey === explicitModel);
    if (modelFilteredParts.length === 0) {
      return {
        handled: true,
        source: 'Cost Knowledge Base',
        matchedRecordIds: [],
        answer: JET_ENGINEER_UNKNOWN_FALLBACK_MESSAGE
      };
    }
  } else if (contextModel === 'F77' || contextModel === 'X47') {
    const matchingContext = scoredParts.filter(sp => sp.entry.modelKey === contextModel);
    if (matchingContext.length > 0 && matchingContext[0].score >= scoredParts[0].score - 15) {
      modelFilteredParts = matchingContext;
    }
  }

  const topCandidate = modelFilteredParts[0];

  const closeMatches = modelFilteredParts.filter(
    sp =>
      sp.entry.familyKey === topCandidate.entry.familyKey &&
      sp.score >= topCandidate.score - 25
  );

  if (closeMatches.length > 1) {
    const blocks = closeMatches.map(cm =>
      formatPartEntryBlock(cm.entry, { labourOnlyFocus: isLabourFocusedQuery })
    );
    return {
      handled: true,
      source: `Cost Knowledge Base (${Array.from(
        new Set(closeMatches.map(c => c.entry.record.record_id))
      ).join(', ')})`,
      matchedRecordIds: Array.from(
        new Set(closeMatches.map(c => c.entry.record.record_id))
      ),
      answer: [
        'Multiple variants match your query. Please specify which exact variant or side (LH/RH, front/rear, centre/bottom) you need:',
        '',
        blocks.join('\n\n---\n\n')
      ].join('\n')
    };
  }

  return {
    handled: true,
    source: `Cost Knowledge Base (${topCandidate.entry.record.record_id})`,
    matchedRecordIds: [topCandidate.entry.record.record_id],
    answer: formatPartEntryBlock(topCandidate.entry, {
      labourOnlyFocus: isLabourFocusedQuery
    })
  };
}
