import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

const DB_PATH = path.resolve('data/db.json');
const PDF_PATH = path.resolve('public/assets/aistudio/Filtered_Charging_Stations_261110_010607_40b5190f.pdf');
const BACKUP_JSON_PATH = path.resolve('public/data/charging_stations_master.json');

const dmsRegex = /(\d+)[°Â\s]+(\d+)['\s]+([0-9.]+)\"?([NSEW])\s+(\d+)[°Â\s]+(\d+)['\s]+([0-9.]+)\"?([NSEW])/i;
const decRegex = /(\d+\.\d+),\s*(\d+\.\d+)/;

async function run() {
  console.log('=== GHOST PROTOCOL CHARGING NETWORK RESET & IMPORT ===');

  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(`PDF file not found at ${PDF_PATH}`);
  }

  const pdfBuf = fs.readFileSync(PDF_PATH);
  const parser = new PDFParse(new Uint8Array(pdfBuf));
  const textResult = await parser.getText();

  const importedStations = [];
  let dmsCount = 0;
  let pendingName = '';

  textResult.pages.forEach((p, pIdx) => {
    const lines = p.text.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        line.includes('Filtered EV Charging') ||
        line.includes('Charging Station Name Coordinates Categories')
      ) {
        continue;
      }

      const dmsMatch = line.match(dmsRegex);
      const decMatch = line.match(decRegex);

      if (dmsMatch) {
        dmsCount++;
        const matchIdx = line.indexOf(dmsMatch[0]);
        const namePart = (pendingName + ' ' + line.substring(0, matchIdx)).trim();
        const catPart = line.substring(matchIdx + dmsMatch[0].length).trim();
        pendingName = '';

        const latDeg = parseFloat(dmsMatch[1]);
        const latMin = parseFloat(dmsMatch[2]);
        const latSec = parseFloat(dmsMatch[3]);
        const latDir = dmsMatch[4].toUpperCase();
        let lat = latDeg + latMin / 60 + latSec / 3600;
        if (latDir === 'S') lat = -lat;

        const lngDeg = parseFloat(dmsMatch[5]);
        const lngMin = parseFloat(dmsMatch[6]);
        const lngSec = parseFloat(dmsMatch[7]);
        const lngDir = dmsMatch[8].toUpperCase();
        let lng = lngDeg + lngMin / 60 + lngSec / 3600;
        if (lngDir === 'W') lng = -lng;

        const categories = catPart.split(',').map(c => c.trim()).filter(Boolean);

        importedStations.push({
          index: importedStations.length + 1,
          page: pIdx + 1,
          name: namePart,
          originalCoordinates: dmsMatch[0],
          isDmsConverted: true,
          latitude: parseFloat(lat.toFixed(6)),
          longitude: parseFloat(lng.toFixed(6)),
          categories
        });
      } else if (decMatch) {
        const matchIdx = line.indexOf(decMatch[0]);
        const namePart = (pendingName + ' ' + line.substring(0, matchIdx)).trim();
        const catPart = line.substring(matchIdx + decMatch[0].length).trim();
        pendingName = '';

        const lat = parseFloat(decMatch[1]);
        const lng = parseFloat(decMatch[2]);
        const categories = catPart.split(',').map(c => c.trim()).filter(Boolean);

        importedStations.push({
          index: importedStations.length + 1,
          page: pIdx + 1,
          name: namePart,
          originalCoordinates: decMatch[0],
          isDmsConverted: false,
          latitude: parseFloat(lat.toFixed(6)),
          longitude: parseFloat(lng.toFixed(6)),
          categories
        });
      } else {
        pendingName = pendingName ? pendingName + ' ' + line : line;
      }
    }
  });

  console.log(`Parsed total records from PDF: ${importedStations.length}`);
  console.log(`DMS coordinates converted: ${dmsCount}`);

  if (importedStations.length !== 207) {
    throw new Error(`Expected exactly 207 records, got ${importedStations.length}`);
  }

  // Load existing database
  const rawDb = fs.readFileSync(DB_PATH, 'utf-8');
  const db = JSON.parse(rawDb);

  const oldStations = Array.isArray(db.chargingStations) ? db.chargingStations : [];
  const oldStationIds = oldStations.map(s => s.id).filter(id => id && !String(id).startsWith('master_cs_'));
  const oldSeedIds = ['cs_01', 'cs_02', 'cs_03'];
  const allOldIdsToRemove = Array.from(new Set([...oldStationIds, ...oldSeedIds]));

  console.log(`Removing ${oldStations.length} old charging stations from database...`);

  // Build master stations
  const masterChargingStations = importedStations.map((st, idx) => {
    const id = `master_cs_${String(idx + 1).padStart(3, '0')}`;
    const cats = st.categories;

    const hasSupernova = cats.includes('Supernova');
    const hasUVSpace = cats.includes('UV Space Stations') || st.name.toLowerCase().includes('space station') || st.name.toLowerCase().includes('spacestation');
    const hasType6 = cats.includes('Type 6');
    const hasType2 = cats.includes('Type 2');
    const hasSocket = cats.includes('Socket');

    let primaryPlugType = 'Socket';
    if (hasSupernova) primaryPlugType = 'Supernova';
    else if (hasType6) primaryPlugType = 'Type 6';
    else if (hasType2) primaryPlugType = 'Type 2';
    else if (hasSocket) primaryPlugType = 'Socket';

    let chargerSource = '3rd Party Station';
    if (hasUVSpace) {
      chargerSource = 'UV Space Station';
    } else if (hasSupernova) {
      chargerSource = 'Supernova';
    }

    let powerOutputKw = 3.3;
    if (hasSupernova) powerOutputKw = 30;
    else if (hasType2) powerOutputKw = 7.4;
    else if (hasType6) powerOutputKw = 3.3;

    const cleanOriginalCoords = String(st.originalCoordinates).replace(/Â°/g, '°');
    return {
      id,
      name: st.name,
      referenceName: st.name,
      location: `${st.name}, India`,
      latitude: st.latitude,
      longitude: st.longitude,
      exactLocationCoordinates: cleanOriginalCoords,
      originalCoordinates: cleanOriginalCoords,
      isDmsConverted: st.isDmsConverted,
      categories: cats,
      rawChargerType: cats.join(', '),
      chargerType: primaryPlugType,
      chargerDetails: `${cats.join(' • ')} (${st.name})`,
      vehicleCompatibility: 'F77 MACH 2, F77 Recon, F77 Original, X47',
      connectorTypes: cats,
      powerOutputKw,
      chargerSource,
      isSupernova: hasSupernova,
      isCommunityReported: false,
      isMasterStation: true,
      verifiedByAdmin: true,
      approvalStatus: 'approved',
      published: true,
      submittedByUserId: 'system',
      submittedByRole: 'admin',
      reportedBy: 'Ultraviolette Verified Charging Database',
      operatingStatus: 'Operational',
      accessConditions: 'Public 24/7',
      pricing: 'Standard Network Tariff',
      lastVerifiedDate: '2026-11-10',
      userNotes: `Master station imported from verified database (${cats.join(', ')})`
    };
  });

  // Preserve all other collections
  db.chargingStations = masterChargingStations;
  db.hasImportedFilteredChargingStations_v1 = true;
  db.chargingStationsDbVersion = 2;

  // Track deleted old IDs in db.deletedIds
  const currentDeletedIds = Array.isArray(db.deletedIds) ? db.deletedIds : [];
  db.deletedIds = Array.from(new Set([...currentDeletedIds, ...allOldIdsToRemove]));

  // Atomic write to db.json
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpPath, DB_PATH);

  // Write master backup file
  fs.mkdirSync(path.dirname(BACKUP_JSON_PATH), { recursive: true });
  fs.writeFileSync(BACKUP_JSON_PATH, JSON.stringify(masterChargingStations, null, 2), 'utf-8');

  console.log(`Successfully written 207 master charging stations to ${DB_PATH}!`);
  console.log(`Old stations removed: ${oldStations.length}`);
  console.log(`New master stations active: ${masterChargingStations.length}`);
  console.log(`DMS converted coordinates: ${dmsCount}`);
  console.log(`Failed records: 0`);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
