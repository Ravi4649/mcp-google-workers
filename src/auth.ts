import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
import { dirname } from 'path';
const __dirname = dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar.readonly'
];

export function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('❌ Credentials file not found!');
    console.error('   Please place your OAuth file at:', CREDENTIALS_PATH);
    console.error('   Download from: https://console.cloud.google.com/apis/credentials');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
}

export function loadToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  }
  return null;
}

export function saveToken(token: any) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
  console.log('✅ Token saved to:', TOKEN_PATH);
}

export async function getAuthClient(): Promise<any> {
  const credentials = loadCredentials();
  const oAuth2Client = new google.auth.OAuth2(
    credentials.installed.client_id,
    credentials.installed.client_secret,
    credentials.installed.redirect_uris[0]
  );

  const token = loadToken();
  if (token) {
    oAuth2Client.setCredentials(token);
    console.log('✅ Token carregado. Autenticação pronta!');
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.log('\n🔐 Authentication required!');
  console.log('📌 Please open this URL in your browser:');
  console.log('┌' + '─'.repeat(80) + '┐');
  console.log('│' + authUrl.padEnd(80) + '│');
  console.log('└' + '─'.repeat(80) + '┘');
  console.log('\n✅ After authorizing, your browser will display a code.');
  console.log('✅ Copy and paste the code below:');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('\n👉 Código de autorização: ', async (code) => {
      rl.close();
      try {
        const { tokens } = await oAuth2Client.getToken(code.trim());
        oAuth2Client.setCredentials(tokens);
        saveToken(tokens);
        console.log('✅ Autenticação concluída com sucesso!');
        resolve(oAuth2Client);
      } catch (error: any) {
        console.error('❌ Erro na autenticação:', error.message);
        process.exit(1);
      }
    });
  });
}

export function getGmail(auth: any) {
  return google.gmail({ version: 'v1', auth });
}

export function getDrive(auth: any) {
  return google.drive({ version: 'v3', auth });
}

export function getCalendar(auth: any) {
  return google.calendar({ version: 'v3', auth });
}

let cachedAuth: any = null;

export async function ensureAuth() {
  if (!cachedAuth) {
    cachedAuth = await getAuthClient();
  }
  return cachedAuth;
}
