/**
 * Script QR Code Generator per NIS (4 Digit)
 * OSIS Candra Kirana SPENASIX Divisi 9
 *
 * Requirements: Node.js (qrcode package: `npm install qrcode`)
 * Output: PNG QR files saved as `qr_1234.png` containing strictly NIS 4 digits.
 */

const fs = require('fs');
const path = require('path');

// Ensure output directory exists
const outputDir = path.join(__dirname, '../assets/qr_output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Sample Student NIS Data List (4 Digits)
const studentList = [
    { nis: '1234', nama: 'Ahmad Fulan', kelas: '9A' },
    { nis: '1235', nama: 'Budi Santoso', kelas: '9A' },
    { nis: '1236', nama: 'Citra Lestari', kelas: '9B' },
    { nis: '1237', nama: 'Dewa Pratama', kelas: '9B' },
    { nis: '1238', nama: 'Eka Rahmawati', kelas: '9C' },
    { nis: '1239', nama: 'Farhan Rizky', kelas: '9C' }
];

async function generateQrCodes() {
    let QRCode;
    try {
        QRCode = require('qrcode');
    } catch (e) {
        console.log('Paket "qrcode" tidak ditemukan. Jalankan `npm install qrcode` terlebih dahulu jika ingin menghasilkan file PNG via Node.js.');
        console.log('Alternatif: Gunakan generator di browser pada id-cards.html.');
        return;
    }

    console.log(`Memulai pembuatan QR Code untuk ${studentList.length} siswa...`);

    for (const student of studentList) {
        // STRICT RULE: QR MUST CONTAIN ONLY 4-DIGIT NIS
        const qrContent = String(student.nis).trim();
        const fileName = `qr_${qrContent}.png`;
        const filePath = path.join(outputDir, fileName);

        await QRCode.toFile(filePath, qrContent, {
            errorCorrectionLevel: 'H',
            type: 'png',
            width: 300,
            margin: 2
        });

        console.log(`✅ Berhasil: ${fileName} [NIS: ${qrContent} - ${student.nama}]`);
    }

    console.log(`\nSelesai! Seluruh QR Code tersimpan di folder: ${outputDir}`);
}

generateQrCodes();
