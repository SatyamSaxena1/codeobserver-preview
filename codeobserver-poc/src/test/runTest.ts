import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite');

    await runTests({ extensionDevelopmentPath, extensionTestsPath });
  } catch (error) {
    console.error('Failed to run tests');
    if (error instanceof Error) {
      console.error(error.message);
    }

    process.exit(1);
  }
}

void main();
