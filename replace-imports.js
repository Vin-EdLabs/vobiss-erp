// replace-imports.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function replaceImports() {
  const srcDir = path.join(__dirname, 'src');
  const files = await fs.readdir(srcDir, { recursive: true });

  for (const file of files) {
    if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const filePath = path.join(srcDir, file);
      let content = await fs.readFile(filePath, 'utf8');

      // Replace the import statement
      const oldImport = "import { supabase } from '../integrations/supabase/client';";
      const newImport = "import { getItems, getCategories, getItemsOut, addItem, updateItem, deleteItem, issueItem, getLowStockItems, getDashboardStats } from '../api';";
      if (content.includes(oldImport)) {
        content = content.replace(oldImport, newImport);
        await fs.writeFile(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
      }
    }
  }
  console.log('Import replacement complete.');
}

replaceImports().catch(console.error);