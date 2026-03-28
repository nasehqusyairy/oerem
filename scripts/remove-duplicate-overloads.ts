const fs = require('fs');
const path = require('path');

/**
 * Menghilangkan baris deklarasi yang duplikat dalam satu interface/file.
 * @param {string} filePath 
 */
function removeDuplicateOverloads(filePath: string) {
    try {
        const absolutePath = path.resolve(filePath);
        const content = fs.readFileSync(absolutePath, 'utf8');

        // Pecah per baris
        const lines = content.split('\n');
        const seenLines = new Set();
        const resultLines = [];

        for (let line of lines) {
            const trimmedLine = line.trim();

            // Logika filter:
            // 1. Jika baris kosong atau komentar, kita biarkan lewat.
            // 2. Jika baris mengandung deklarasi method (punya kurung dan titik koma).
            if (trimmedLine.length > 0 && trimmedLine.includes('(') && trimmedLine.endsWith(';')) {
                if (!seenLines.has(trimmedLine)) {
                    seenLines.add(trimmedLine);
                    resultLines.push(line);
                } else {
                    console.log(`[Removed Duplicate]: ${trimmedLine}`);
                }
            } else {
                // Baris non-method (export, opening brace, closing brace, etc) tetap dimasukkan
                resultLines.push(line);
            }
        }

        const newContent = resultLines.join('\n');
        fs.writeFileSync(absolutePath, newContent, 'utf8');
        console.log(`\nSukses: ${filePath} telah dibersihkan.`);

    } catch (error) {
        console.error(`Gagal memproses file: ${(error as any).message}`);
    }
}

// Jalankan program
const targetFile = './src/oerem-query.ts';
removeDuplicateOverloads(targetFile);