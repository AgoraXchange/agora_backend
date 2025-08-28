import CryptoJS from 'crypto-js';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
};

async function encryptPrivateKey() {
  try {
    console.log('=== Private Key Encryption Tool ===\n');
    
    const privateKey = await question('Enter your private key: ');
    const encryptionKey = await question('Enter your encryption key (min 32 chars): ');
    
    if (encryptionKey.length < 32) {
      console.error('\nError: Encryption key must be at least 32 characters long');
      process.exit(1);
    }
    
    const encrypted = CryptoJS.AES.encrypt(privateKey, encryptionKey).toString();
    
    console.log('\n=== Encrypted Private Key ===');
    console.log(encrypted);
    console.log('\nAdd this to your .env file as ORACLE_PRIVATE_KEY_ENCRYPTED');
    console.log('Make sure to keep your ENCRYPTION_KEY secure!');
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  } finally {
    rl.close();
  }
}

encryptPrivateKey();