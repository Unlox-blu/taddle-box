const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const sharp = require('sharp');

/**
 * Usage: node lottie_converter.js
 * Reads all .zip/.lottie files from scripts/input and outputs to scripts/output
 * Requires: npm install sharp adm-zip
 */
async function processLottie() {
  const inputDir = path.join(__dirname, 'input');
  const outputDir = path.join(__dirname, 'output');

  if (!fs.existsSync(inputDir)) {
    fs.mkdirSync(inputDir, { recursive: true });
    console.log(`Created input directory at ${inputDir}. Please place your zip files there.`);
    return;
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.zip') || f.endsWith('.lottie'));
  
  if (files.length === 0) {
    console.log(`No .zip or .lottie files found in ${inputDir}`);
    return;
  }

  for (const file of files) {
    const inputFile = path.join(inputDir, file);
    const baseName = path.basename(file, path.extname(file));
    const outputFile = path.join(outputDir, `${baseName}_converted.lottie`);

    console.log(`\n========================================`);
    console.log(`Processing: ${file}`);
    
    const zip = new AdmZip(inputFile);
    
    const tempDir = path.join(__dirname, 'temp_lottie_convert_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      console.log(`Extracting to temporary directory...`);
      zip.extractAllTo(tempDir, true);

      // 1. Process main.json
      const mainJsonPath = path.join(tempDir, 'animations', 'main.json');
      if (fs.existsSync(mainJsonPath)) {
        console.log('Found animations/main.json, updating asset extensions...');
        const rawData = fs.readFileSync(mainJsonPath, 'utf8');
        const jsonData = JSON.parse(rawData);

        if (jsonData.assets) {
          jsonData.assets.forEach(asset => {
            if (asset.p && asset.p.endsWith('.webp')) {
              asset.p = asset.p.replace('.webp', '.png');
            }
          });
        }

        fs.writeFileSync(mainJsonPath, JSON.stringify(jsonData));
      } else {
        console.warn('Warning: animations/main.json not found. Check archive structure.');
      }

      // 2. Convert .webp to .png
      console.log('Converting .webp assets to .png...');
      const walkSync = (dir, filelist = []) => {
        fs.readdirSync(dir).forEach(f => {
          const filepath = path.join(dir, f);
          if (fs.statSync(filepath).isDirectory()) {
            filelist = walkSync(filepath, filelist);
          } else {
            filelist.push(filepath);
          }
        });
        return filelist;
      };

      const extractedFiles = walkSync(tempDir);
      const webpFiles = extractedFiles.filter(f => f.endsWith('.webp'));

      for (const webpFile of webpFiles) {
        const pngFile = webpFile.replace('.webp', '.png');
        
        // Read into buffer first to prevent sharp from holding file locks on Windows
        const buffer = fs.readFileSync(webpFile);
        await sharp(buffer).png().toFile(pngFile);
        
        fs.unlinkSync(webpFile); // delete original webp
      }
      console.log(`Converted ${webpFiles.length} files.`);

      // 3. Zip back into .lottie
      console.log(`Creating output file: ${outputFile}`);
      const newZip = new AdmZip();
      newZip.addLocalFolder(tempDir);
      newZip.writeZip(outputFile);
      
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    } finally {
      // 4. Cleanup
      console.log('Cleaning up temporary files...');
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  console.log('\n✨ Success! All files processed.');
}



processLottie().catch(err => {
  console.error('Error processing lottie:', err);
});
