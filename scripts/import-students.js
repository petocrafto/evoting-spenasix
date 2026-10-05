/**
 * CLI Student Importer Script
 * OSIS Candra Kirana SPENASIX Divisi 9
 *
 * Usage: node scripts/import-students.js path/to/students.json
 */

const fs = require('fs');
const path = require('path');

function validateAndParseStudents(jsonFilePath) {
    if (!fs.existsSync(jsonFilePath)) {
        console.error(`File tidak ditemukan: ${jsonFilePath}`);
        process.exit(1);
    }

    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    const students = JSON.parse(rawData);

    const validList = [];
    const errors = [];
    const nisSet = new Set();

    students.forEach((s, idx) => {
        const line = idx + 1;
        const nis = String(s.nis || '').trim();
        const nama = String(s.nama || '').trim();
        const kelas = String(s.kelas || '').trim();

        if (!/^\d{4}$/.test(nis)) {
            errors.push(`Item ${line}: NIS '${nis}' tidak valid (harus tepat 4 digit).`);
            return;
        }

        if (nisSet.has(nis)) {
            errors.push(`Item ${line}: NIS '${nis}' duplikat.`);
            return;
        }

        if (!nama || !kelas) {
            errors.push(`Item ${line}: Nama dan Kelas wajib diisi.`);
            return;
        }

        nisSet.add(nis);
        validList.push({ nis, nama, kelas });
    });

    console.log(`--- HASIL VALIDASI IMPOR ---`);
    console.log(`Total Valid: ${validList.length}`);
    console.log(`Total Error: ${errors.length}`);
    if (errors.length > 0) {
        console.log(`\nDetail Error:`);
        errors.forEach(e => console.error(` ❌ ${e}`));
    }

    return validList;
}

const args = process.argv.slice(2);
if (args.length > 0) {
    validateAndParseStudents(args[0]);
} else {
    console.log('Gunakan: node scripts/import-students.js <file-data-siswa.json>');
}
