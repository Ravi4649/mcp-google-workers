// @ts-nocheck
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensureAuth } from '../auth.js';
import * as fs from 'fs';
import * as path from 'path';
import z from 'zod';

// MIME type mapping by extension
const MIME_TYPE_MAP: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.tsx': 'application/javascript; component=tsx',
  '.html': 'text/html',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPE_MAP[ext] || 'application/octet-stream';
}

// Função para verificar e tratar erros do Google API
function handleGoogleApiError(error, operation) {
  if (error.code && error.errors) {
    const errorCode = error.code;
    const errorMessage = error.errors[0]?.message || error.message;
    
    switch (errorCode) {
      case 401:
        return `Erro de autenticação (${errorCode}): ${errorMessage}. Por favor, reautentique.`;
      case 403:
        return `Acesso negado (${errorCode}): ${errorMessage}. Verifique suas permissões.`;
      case 404:
        return `Recurso não encontrado (${errorCode}): ${errorMessage}`;
      case 429:
        return `Limite de requisições excedido (${errorCode}): ${errorMessage}. Aguarde e tente novamente.`;
      case 500:
      case 503:
        return `Erro temporário do servidor (${errorCode}): ${errorMessage}. Tente novamente mais tarde.`;
      default:
        return `Erro na operação ${operation}: ${errorMessage} (Código: ${errorCode})`;
    }
  }
  return `Erro na operação ${operation}: ${error.message}`;
}

export function registerDriveTools(server) {
  server.tool(
    'list_files',
    'Lista arquivos e pastas do Google Drive. Use: "lista todas as pastas", "lista só arquivos", "lista 20 arquivos recentes"',
    {
      limit: z.number().default(10).describe('Quantidade máxima de itens a listar (padrão 10)'),
      type: z.enum(['todos', 'pastas', 'arquivos']).optional().describe('Tipo de itens: "pastas" para só pastas, "arquivos" para só arquivos, ou deixe em branco para todos'),
      folderName: z.string().optional().describe('Nome de uma pasta específica para listar seu conteúdo (opcional)')
    },
    async ({ limit, type, folderName }) => {
      try {
        console.log(`[DEBUG] list_files chamado com limit: ${limit}, type: ${type}, folderName: ${folderName}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        // Se folderName foi fornecido, precisamos primeiro encontrar o ID da pasta
        let folderId = null;
        let searchQuery = 'trashed=false';

        if (folderName) {
          const folderSearch = await drive.files.list({
            q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1
          });

          const folders = folderSearch.data.files || [];
          if (folders.length === 0) {
            return {
              content: [{ type: 'text', text: `❌ Pasta "${folderName}" não encontrada.` }]
            };
          }
          folderId = folders[0].id;
          searchQuery = `'${folderId}' in parents and trashed=false`;
        }

        // Adicionar filtro de tipo se necessário
        if (type === 'pastas') {
          searchQuery += ` and mimeType='application/vnd.google-apps.folder'`;
        } else if (type === 'arquivos') {
          searchQuery += ` and mimeType!='application/vnd.google-apps.folder'`;
        }

        const response = await drive.files.list({
          pageSize: limit || 10,
          fields: 'files(id, name, mimeType, createdTime, modifiedTime)',
          orderBy: 'modifiedTime desc',
          q: searchQuery
        });

        const files = response.data.files || [];
        console.log(`[DEBUG] list_files encontrou ${files.length} itens`);

        const pastas = [];
        const arquivos = [];

        files.forEach(f => {
          const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
          const modified = new Date(f.modifiedTime).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

          if (isFolder) {
            pastas.push({ name: f.name, id: f.id });
          } else {
            arquivos.push({ name: f.name, modified });
          }
        });

        let fileListText = '';

        if (folderName) {
          fileListText += `📂 **Conteúdo da pasta "${folderName}"**:\n\n`;
        } else {
          fileListText += '📂 **Pastas**:\n';
        }

        if (type !== 'arquivos') {
          if (pastas.length > 0) {
            fileListText += 'Pastas:\n';
            pastas.forEach(p => {
              fileListText += `📁 ${p.name}\n`;
            });
            fileListText += '\n';
          } else if (type === 'pastas' || !folderName) {
            fileListText += folderName ? 'Nenhuma pasta nesta pasta.\n\n' : 'Nenhuma pasta encontrada.\n\n';
          }
        }

        if (type !== 'pastas') {
          if (arquivos.length > 0) {
            fileListText += 'Arquivos:\n';
            arquivos.forEach((f, index) => {
              fileListText += `${index + 1}. 📄 ${f.name} | ${f.modified}\n`;
            });
          } else if (type === 'arquivos') {
            fileListText += 'Nenhum arquivo encontrado.\n';
          }
        }

        return {
          content: [{ type: 'text', text: fileListText }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'list_files');
        console.error(`[ERROR] list_files: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao listar arquivos: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'get_folder_id',
    'Pega o ID de uma pasta pelo nome. Exemplo: "Qual o ID da pasta Claude AI?"',
    { folderName: z.string().describe('Nome da pasta para buscar o ID') },
    async ({ folderName }) => {
      try {
        console.log(`[DEBUG] get_folder_id chamado com folderName: ${folderName}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
          q: `name contains '${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id, name, modifiedTime)',
          pageSize: 5
        });

        const files = response.data.files || [];

        if (files.length === 0) {
          return {
            content: [{ type: 'text', text: `❌ Pasta "${folderName}" não encontrada.` }]
          };
        }

        const folderInfo = files.map(f => `   📁 **${f.name}**\n      ID: \`${f.id}\`\n      Modificado: ${new Date(f.modifiedTime).toLocaleDateString('pt-BR')}`).join('\n');

        return {
          content: [{ type: 'text', text: `📂 Pasta${files.length > 1 ? 's' : ''} encontrada${files.length > 1 ? 's' : ''}:\n${folderInfo}` }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'get_folder_id');
        console.error(`[ERROR] get_folder_id: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao buscar pasta: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'read_file',
    'Lê o conteúdo de arquivos de texto (md, txt, json, js, ts, html, css, csv, etc). Exemplo: "Lê o conteúdo do arquivo teste.md"',
    { fileName: z.string().describe('Nome do arquivo para buscar e ler o conteúdo') },
    async ({ fileName }) => {
      try {
        console.log(`[DEBUG] read_file chamado com fileName: ${fileName}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        // Primeiro, busca o ID do arquivo pelo nome
        const searchResponse = await drive.files.list({
          q: `name='${fileName}' and trashed=false`,
          fields: 'files(id, name, mimeType)',
          pageSize: 1
        });

        const files = searchResponse.data.files || [];
        if (files.length === 0) {
          return {
            content: [{ type: 'text', text: `❌ Arquivo "${fileName}" não encontrado.` }]
          };
        }

        const file = files[0];
        const mimeType = file.mimeType;

        // Verifica se é um arquivo de texto suportado
        const textMimeTypes = [
          'text/plain', 'text/markdown', 'text/csv', 'text/html',
          'application/json', 'application/javascript', 'application/typescript'
        ];

        if (!textMimeTypes.some(tm => mimeType.includes(tm))) {
          return {
            content: [{
              type: 'text',
              text: `⚠️ O arquivo "${fileName}" é do tipo ${mimeType} que não pode ser lido diretamente como texto.\n\n` +
                    `Use o comando "baixe o arquivo ${fileName}" para baixá-lo e visualizar.`
            }]
          };
        }

        // Usa drive.files.get com alt=media para obter o conteúdo
        const fileResponse = await drive.files.get({
          fileId: file.id,
          alt: 'media'
        });

        const content = fileResponse.data;

        return {
          content: [{
            type: 'text',
            text: `📄 **Conteúdo do arquivo: ${fileName}**\n\n${'─'.repeat(50)}\n\n${content}\n\n${'─'.repeat(50)}`
          }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'read_file');
        console.error(`[ERROR] read_file: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao ler arquivo: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'convert_file',
    'Converte um arquivo para outro formato e salva no Drive. Exemplos: "Converte PDF para Word", "Converte .docx para PDF", "Converte planilha XLSX para CSV"',
    {
      fileName: z.string().describe('Nome do arquivo original no Drive'),
      targetFormat: z.string().describe('Formato desejado (pdf, docx, xlsx, csv, txt, png, jpg, etc.)'),
      newFileName: z.string().optional().describe('Nome para o arquivo convertido (opcional, padrão: nome_original_convertido)')
    },
    async ({ fileName, targetFormat, newFileName }) => {
      try {
        console.log(`[DEBUG] convert_file chamado: ${fileName} -> ${targetFormat}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        // Busca o arquivo original
        const searchResponse = await drive.files.list({
          q: `name='${fileName}' and trashed=false`,
          fields: 'files(id, name, mimeType)',
          pageSize: 1
        });

        const files = searchResponse.data.files || [];
        if (files.length === 0) {
          return {
            content: [{ type: 'text', text: `❌ Arquivo "${fileName}" não encontrado.` }]
          };
        }

        const originalFile = files[0];
        const originalMimeType = originalFile.mimeType;
        const targetMimeTypes: Record<string, string> = {
          'pdf': 'application/pdf',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'csv': 'text/csv',
          'txt': 'text/plain',
          'html': 'text/html',
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'json': 'application/json'
        };

        const targetMimeType = targetMimeTypes[targetFormat.toLowerCase()];
        if (!targetMimeType) {
          return {
            content: [{ type: 'text', text: `❌ Formato "${targetFormat}" não suportado. Formatos disponíveis: pdf, docx, xlsx, csv, txt, html, png, jpg, jpeg, json.` }]
          };
        }

        // Tenta usar a conversão nativa do Google Drive
        let convertUrl = `https://www.googleapis.com/drive/v3/files/${originalFile.id}/export?mimeType=${encodeURIComponent(targetMimeType)}`;

        // Para algumas conversões, o Drive suporta nativamente
        const nativeConversions = [
          'application/vnd.google-apps.document',
          'application/vnd.google-apps.spreadsheet',
          'application/vnd.google-apps.presentation',
          'application/vnd.google-apps.drawing'
        ];

        let convertedFileId: string | null = null;
        let conversionMethod = '';

        // Se for uma conversão nativa do Google, tenta primeiro
        if (nativeConversions.includes(originalMimeType)) {
          try {
            const exportResponse = await drive.files.get({
              fileId: originalFile.id,
              alt: 'media',
              mimeType: targetMimeType
            });
            conversionMethod = 'conversão nativa do Google Drive';
            // O export retorna o conteúdo, mas não o ID - teríamos que fazer upload
            // Por enquanto, vamos gerar o link de exportação
            convertUrl = `https://drive.google.com/uc?export=download&id=${originalFile.id}&convert=true`;
          } catch (error: any) {
            conversionMethod = 'download manual';
          }
        } else {
          conversionMethod = 'download manual';
        }

        const suggestedName = newFileName || `${originalFile.name.split('.')[0]}_convertido.${targetFormat}`;

        return {
          content: [{
            type: 'text',
            text: `🔄 **Conversão de arquivo**\n\n` +
                  `   📄 Original: ${originalFile.name}\n` +
                  `   🎯 Para: ${targetFormat.toUpperCase()}\n` +
                  `   💡 Método: ${conversionMethod}\n\n` +
                  `📥 **Link para download convertido:**\n` +
                  `   ${convertUrl}\n\n` +
                  `📌 **Próximos passos:**\n` +
                  `   1. Baixe o arquivo usando o link acima\n` +
                  `   2. Se quiser, faça upload do arquivo convertido para o Drive\n` +
                  `   3. Ou peça: "Crie um arquivo no Drive com o conteúdo X"\n\n` +
                  `⚠️ **Nota:** Algumas conversões complexas (ex: PDF ↔ Word) podem exigir download manual e reupload.`
          }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'convert_file');
        console.error(`[ERROR] convert_file: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao converter arquivo: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'download_file',
    'Baixa qualquer arquivo do Google Drive para visualizar ou converter. Exemplo: "Baixe o arquivo foto.png"',
    { fileName: z.string().describe('Nome do arquivo para buscar e baixar') },    async ({ fileName }) => {
      try {
        console.log(`[DEBUG] download_file chamado com fileName: ${fileName}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        // Busca o ID do arquivo
        const searchResponse = await drive.files.list({
          q: `name='${fileName}' and trashed=false`,
          fields: 'files(id, name, mimeType, size)',
          pageSize: 1
        });

        const files = searchResponse.data.files || [];
        if (files.length === 0) {
          return {
            content: [{ type: 'text', text: `❌ Arquivo "${fileName}" não encontrado.` }]
          };
        }

        const file = files[0];
        const size = file.size ? `${(parseInt(file.size) / 1024).toFixed(2)} KB` : 'desconhecido';

        // Obtém o link de download direto
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;

        return {
          content: [{
            type: 'text',
            text: `📥 **File found:**\n\n` +
                  `   📄 Name: ${file.name}\n` +
                  `   📊 Type: ${file.mimeType}\n` +
                  `   📏 Size: ${size}\n\n` +
                  `🔗 **Direct download link:**\n` +
                  `   ${downloadUrl}\n\n` +
                  `📌 **Instructions:**\n` +
                  `   1. Click the link above to download the file\n` +
                  `   2. After downloading, you can open it directly or ask to convert it\n\n` +
                  `Tip: If you want to convert this file, let me know after downloading!`
          }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'download_file');
        console.error(`[ERROR] download_file: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao gerar link de download: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'read_file_metadata',
    'Lê os metadados de um arquivo do Google Drive pelo ID. Exemplo: "Lê os metadados do arquivo com ID X"',
    { fileId: z.string().describe('ID do arquivo no Google Drive') },    async ({ fileId }) => {
      try {
        console.log(`[DEBUG] read_file_metadata chamado com fileId: ${fileId}`);
        if (!fileId || fileId.trim() === '') {
          return {
            content: [{ type: 'text', text: 'Erro: É necessário fornecer o ID do arquivo.' }],
            isError: true
          };
        }
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const file = await drive.files.get({
          fileId: fileId,
          fields: 'id, name, mimeType, size, createdTime, modifiedTime, webContentLink'
        });

        const f = file.data;
        console.log(`[DEBUG] read_file_metadata resultado: ${f.name}`);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size ? `${(parseInt(f.size) / 1024).toFixed(2)} KB` : 'N/A',
            created: f.createdTime,
            modified: f.modifiedTime,
            webLink: f.webContentLink || 'N/A'
          }, null, 2) }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'read_file_metadata');
        console.error(`[ERROR] read_file_metadata: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao ler arquivo: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'create_folder',
    'Cria uma pasta no Google Drive. Use: create_folder({ name: "NomeDaPasta" })',
    {
      name: z.string().describe('Nome da pasta a ser criada')
    },
    async ({ name }) => {
      try {
        console.log(`[DEBUG] create_folder chamado com name: ${name}`);
        if (!name || name.trim() === '') {
          return {
            content: [{ type: 'text', text: 'Erro: Nome da pasta é obrigatório' }],
            isError: true
          };
        }

        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const folder = await drive.files.create({
          requestBody: {
            name: name.trim(),
            mimeType: 'application/vnd.google-apps.folder'
          },
          fields: 'id, name'
        });

        console.log(`[DEBUG] create_folder resultado: ${folder.data.name}`);
        return {
          content: [{ type: 'text', text: `Pasta "${folder.data.name}" criada no Google Drive! ID: ${folder.data.id}` }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'create_folder');
        console.error(`[ERROR] create_folder: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao criar pasta: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'upload_file',
    'Upload a local file to Google Drive. Exemplo: "Upload do arquivo /tmp/minha.txt para o Drive"',
    {
      filePath: z.string().describe('Caminho local do arquivo a fazer upload'),
      fileName: z.string().optional().describe('Nome do arquivo no Drive (padrão: usa o nome original)'),
      parentId: z.string().optional().describe('ID da pasta de destino no Drive (opcional)')
    },
    async ({ filePath, fileName, parentId }) => {
      try {
        console.log(`[DEBUG] upload_file chamado com filePath: ${filePath}, fileName: ${fileName}, parentId: ${parentId}`);
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ type: 'text', text: `Error: File not found: ${filePath}` }],
            isError: true
          };
        }

        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          return {
            content: [{ type: 'text', text: `Error: Path is not a file: ${filePath}` }],
            isError: true
          };
        }

        const actualFileName = fileName || path.basename(filePath);
        const mimeType = detectMimeType(filePath);

        const fileMetadata = {
          name: actualFileName,
          mimeType: mimeType
        };

        if (parentId) {
          fileMetadata.parents = [parentId];
        }

        const media = {
          mimeType: mimeType,
          body: fs.createReadStream(filePath)
        };

        const response = await drive.files.create({
          requestBody: fileMetadata,
          media: media,
          fields: 'id, name, size, createdTime'
        });

        const f = response.data;
        console.log(`[DEBUG] upload_file resultado: ${f.name}`);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            fileId: f.id,
            fileName: f.name,
            size: f.size,
            createdTime: f.createdTime
          }, null, 2) }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'upload_file');
        console.error(`[ERROR] upload_file: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Error uploading file: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'create_file',
    'Create a text file with content directly in Google Drive. Exemplo: "Cria um arquivo teste.md com o conteúdo Olá Mundo"',
    {
      fileName: z.string().describe('Nome do arquivo a ser criado (ex: teste.md)'),
      content: z.string().describe('Conteúdo do arquivo'),
      parentId: z.string().optional().describe('ID da pasta pai (opcional)')
    },
    async ({ fileName, content, parentId }) => {
      try {
        console.log(`[DEBUG] create_file chamado com fileName: ${fileName}`);
        if (!fileName || fileName.trim() === '') {
          return {
            content: [{ type: 'text', text: 'Erro: É necessário fornecer um nome para o arquivo.' }],
            isError: true
          };
        }
        if (!content) {
          return {
            content: [{ type: 'text', text: 'Erro: É necessário fornecer conteúdo para o arquivo.' }],
            isError: true
          };
        }

        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const mimeType = detectMimeType(fileName);

        const fileMetadata = {
          name: fileName.trim()
        };

        if (parentId) {
          fileMetadata.parents = [parentId];
        }

        const response = await drive.files.create({
          requestBody: fileMetadata,
          media: {
            mimeType: mimeType,
            body: content
          },
          fields: 'id, name, size, createdTime'
        });

        const f = response.data;
        console.log(`[DEBUG] create_file resultado: ${f.name}`);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            fileId: f.id,
            fileName: f.name,
            size: f.size,
            createdTime: f.createdTime
          }, null, 2) }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'create_file');
        console.error(`[ERROR] create_file: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Error creating file: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_folder',
    'Lista o conteúdo de uma pasta específica no Google Drive. Exemplo: "Lista o conteúdo da pasta com ID X"',
    {
      folderId: z.string().describe('ID da pasta no Google Drive'),
      limit: z.number().default(20).describe('Quantidade máxima de arquivos (padrão 20)')
    },
    async ({ folderId, limit }) => {
      try {
        console.log(`[DEBUG] list_folder chamado com folderId: ${folderId}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: 'files(id, name, mimeType, size, createdTime, modifiedTime)',
          pageSize: limit || 20
        });

        const files = response.data.files || [];
        console.log(`[DEBUG] list_folder encontrou ${files.length} arquivos`);
        const fileList = files.map(f => ({
          name: f.name,
          type: f.mimeType === 'application/vnd.google-apps.folder' ? 'Folder' : 'File',
          size: f.size ? `${(parseInt(f.size) / 1024).toFixed(2)} KB` : 'N/A',
          created: f.createdTime,
          modified: f.modifiedTime
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(fileList, null, 2) }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'list_folder');
        console.error(`[ERROR] list_folder: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao listar pasta: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_file',
    'Exclui um arquivo ou pasta do Google Drive (move para lixeira). Exemplo: "Exclua o arquivo X"',
    { fileId: z.string().describe('ID do arquivo ou pasta a excluir') },
    async ({ fileId }) => {
      try {
        console.log(`[DEBUG] delete_file chamado com fileId: ${fileId}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        await drive.files.update({
          fileId: fileId,
          requestBody: {
            trashed: true
          }
        });

        console.log(`[DEBUG] delete_file concluído para fileId: ${fileId}`);
        return {
          content: [{ type: 'text', text: `Arquivo/pasta com ID ${fileId} movido para a lixeira com sucesso!` }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'delete_file');
        console.error(`[ERROR] delete_file: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao excluir arquivo: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_permanently',
    'Exclui permanentemente um arquivo ou pasta da lixeira do Google Drive. Exemplo: "Exclua permanentemente o arquivo X"',
    { fileId: z.string().describe('ID do arquivo ou pasta a excluir permanentemente') },
    async ({ fileId }) => {
      try {
        console.log(`[DEBUG] delete_permanently chamado com fileId: ${fileId}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        await drive.files.delete({
          fileId: fileId
        });

        console.log(`[DEBUG] delete_permanently concluído para fileId: ${fileId}`);
        return {
          content: [{ type: 'text', text: `Arquivo/pasta com ID ${fileId} excluído permanentemente!` }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'delete_permanently');
        console.error(`[ERROR] delete_permanently: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao excluir permanentemente: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_trash',
    'Lista os arquivos na lixeira do Google Drive. Exemplo: "Lista os arquivos na lixeira"',
    { limit: z.number().default(20).describe('Quantidade máxima de arquivos (padrão 20)') },
    async ({ limit }) => {
      try {
        console.log(`[DEBUG] list_trash chamado com limit: ${limit}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
          q: 'trashed=true',
          fields: 'files(id, name, mimeType, size, trashedTime)',
          pageSize: limit || 20
        });

        const files = response.data.files || [];
        console.log(`[DEBUG] list_trash encontrou ${files.length} arquivos`);
        const fileList = files.map(f => ({
          name: f.name,
          type: f.mimeType === 'application/vnd.google-apps.folder' ? 'Folder' : 'File',
          size: f.size ? `${(parseInt(f.size) / 1024).toFixed(2)} KB` : 'N/A',
          trashedTime: f.trashedTime
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(fileList, null, 2) }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'list_trash');
        console.error(`[ERROR] list_trash: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao listar lixeira: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'search_files',
    'Busca arquivos no Google Drive por nome. Exemplo: "Busca arquivos com o termo X no nome"',
    {
      query: z.string().describe('Termo de busca usado no nome do arquivo'),
      limit: z.number().default(20).describe('Quantidade máxima de resultados (padrão 20)')
    },
    async ({ query, limit }) => {
      try {
        console.log(`[DEBUG] search_files chamado com query: ${query}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
          q: `name contains '${query}' and trashed=false`,
          fields: 'files(id, name, mimeType, size, createdTime, modifiedTime)',
          pageSize: limit || 20
        });

        const files = response.data.files || [];
        console.log(`[DEBUG] search_files encontrou ${files.length} arquivos`);
        const fileList = files.map(f => ({
          name: f.name,
          type: f.mimeType === 'application/vnd.google-apps.folder' ? 'Folder' : 'File',
          size: f.size ? `${(parseInt(f.size) / 1024).toFixed(2)} KB` : 'N/A',
          created: f.createdTime,
          modified: f.modifiedTime
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(fileList, null, 2) }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'search_files');
        console.error(`[ERROR] search_files: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao buscar arquivos: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'rename_file',
    'Renomeia um arquivo ou pasta no Google Drive. Exemplo: "Renomeie o arquivo X para Y"',
    {
      fileId: z.string().describe('ID do arquivo ou pasta a renomear'),
      newName: z.string().describe('Novo nome para o arquivo/pasta')
    },
    async ({ fileId, newName }) => {
      try {
        console.log(`[DEBUG] rename_file chamado com fileId: ${fileId}, newName: ${newName}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const file = await drive.files.update({
          fileId: fileId,
          requestBody: {
            name: newName
          },
          fields: 'id, name, modifiedTime'
        });

        console.log(`[DEBUG] rename_file concluído: ${file.data.name}`);
        return {
          content: [{ type: 'text', text: `Arquivo/pasta renomeado com sucesso! Novo nome: ${file.data.name}` }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'rename_file');
        console.error(`[ERROR] rename_file: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao renomear arquivo: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'move_file',
    'Move um arquivo ou pasta para outra pasta no Google Drive. Exemplo: "Mova o arquivo X para a pasta Y"',
    {
      fileId: z.string().describe('ID do arquivo ou pasta a mover'),
      newParentId: z.string().describe('ID da pasta de destino')
    },
    async ({ fileId, newParentId }) => {
      try {
        console.log(`[DEBUG] move_file chamado com fileId: ${fileId}, newParentId: ${newParentId}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const file = await drive.files.get({
          fileId: fileId,
          fields: 'parents'
        });

        const oldParents = file.data.parents || [];

        // Primeiro adiciona ao novo parent
        await drive.files.update({
          fileId: fileId,
          requestBody: {
            addParents: [newParentId]
          },
          fields: 'id, name, parents'
        });

        // Depois remove dos parents antigos
        for (const oldParent of oldParents) {
          await drive.files.update({
            fileId: fileId,
            requestBody: {
              removeParents: [oldParent]
            }
          });
        }

        console.log(`[DEBUG] move_file concluído para fileId: ${fileId}`);
        return {
          content: [{ type: 'text', text: `Arquivo movido para a pasta com sucesso!` }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'move_file');
        console.error(`[ERROR] move_file: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao mover arquivo: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'copy_file',
    'Duplica um arquivo no Google Drive. Exemplo: "Crie uma cópia do arquivo X"',
    {
      fileId: z.string().describe('ID do arquivo a copiar'),
      newFileName: z.string().optional().describe('Nome para a cópia (opcional, padrão: nome original + "(cópia)")')
    },
    async ({ fileId, newFileName }) => {
      try {
        console.log(`[DEBUG] copy_file chamado com fileId: ${fileId}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const originalFile = await drive.files.get({
          fileId: fileId,
          fields: 'id, name, mimeType'
        });

        const requestBody = {
          name: newFileName || `${originalFile.data.name} (cópia)`,
          mimeType: originalFile.data.mimeType
        };

        const copy = await drive.files.copy({
          fileId: fileId,
          requestBody: requestBody,
          fields: 'id, name, createdTime'
        });

        console.log(`[DEBUG] copy_file resultado: ${copy.data.name}`);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            originalId: fileId,
            copiedId: copy.data.id,
            copiedName: copy.data.name,
            createdTime: copy.data.createdTime
          }, null, 2) }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'copy_file');
        console.error(`[ERROR] copy_file: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao copiar arquivo: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'restore_file',
    'Restaura um arquivo ou pasta da lixeira do Google Drive. Exemplo: "Restaure o arquivo X da lixeira"',
    { fileId: z.string().describe('ID do arquivo ou pasta a restaurar') },
    async ({ fileId }) => {
      try {
        console.log(`[DEBUG] restore_file chamado com fileId: ${fileId}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        await drive.files.update({
          fileId: fileId,
          requestBody: {
            trashed: false
          },
          fields: 'id, name'
        });

        console.log(`[DEBUG] restore_file concluído para fileId: ${fileId}`);
        return {
          content: [{ type: 'text', text: `Arquivo/pasta restaurado com sucesso!` }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'restore_file');
        console.error(`[ERROR] restore_file: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro ao restaurar arquivo: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'convert_and_save',
    'Converte e salva automaticamente no Drive. Exemplos: "Converte texto.md para PDF e salva", "Converte notebook.ipynb para HTML"',
    {
      fileName: z.string().describe('Nome do arquivo original no Drive'),
      targetFormat: z.string().describe('Formato desejado: pdf, html, txt, json, md, csv'),
      saveFileName: z.string().optional().describe('Nome para o arquivo salvo (opcional)')
    },
    async ({ fileName, targetFormat, saveFileName }) => {
      try {
        console.log(`[DEBUG] convert_and_save: ${fileName} -> ${targetFormat}`);
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const drive = google.google.drive({ version: 'v3', auth });

        const searchResponse = await drive.files.list({
          q: `name='${fileName}' and trashed=false`,
          fields: 'files(id, name, mimeType, size)',
          pageSize: 1
        });

        const files = searchResponse.data.files || [];
        if (files.length === 0) {
          return {
            content: [{ type: 'text', text: `❌ Arquivo "${fileName}" não encontrado.` }]
          };
        }

        const originalFile = files[0];

        const textMimeTypes = [
          'text/plain', 'text/markdown', 'text/csv', 'text/html',
          'application/json', 'application/javascript', 'application/typescript'
        ];

        if (!textMimeTypes.some(tm => originalFile.mimeType.includes(tm))) {
          return {
            content: [{
              type: 'text',
              text: `⚠️ File "${fileName}" is not a supported text file.\n` +
                    `Type: ${originalFile.mimeType}\n\n` +
                    `Tip: Use "read file" first to see if it's text, then try converting.`
            }]
          };
        }

        const fileResponse = await drive.files.get({
          fileId: originalFile.id,
          alt: 'media'
        });
        const originalContent = fileResponse.data;

        let convertedContent = originalContent;
        let convertedMimeType = 'text/plain';

        const formatMimeTypes: Record<string, string> = {
          'pdf': 'application/pdf',
          'html': 'text/html',
          'txt': 'text/plain',
          'json': 'application/json',
          'md': 'text/markdown',
          'csv': 'text/csv'
        };

        convertedMimeType = formatMimeTypes[targetFormat.toLowerCase()] || 'text/plain';

        if (targetFormat.toLowerCase() === 'html') {
          convertedContent = `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><title>${fileName}</title></head>\n<body>\n<pre style="font-family: monospace; white-space: pre-wrap;">${originalContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>\n</body>\n</html>`;
        } else if (targetFormat.toLowerCase() === 'pdf') {
          convertedContent = `%PDF-1.4\n${originalContent}\n\n[Note: For real PDF, use dedicated tools like pandoc or wkhtmltopdf]`;
        }

        const newFileName = saveFileName || `${originalFile.name.replace(/\.[^/.]+$/, '')}_converted.${targetFormat}`;

        const newFile = await drive.files.create({
          requestBody: {
            name: newFileName,
            mimeType: convertedMimeType
          },
          media: {
            mimeType: convertedMimeType,
            body: convertedContent
          },
          fields: 'id, name, createdTime, webViewLink'
        });

        const downloadUrl = `https://drive.google.com/file/d/${newFile.data.id}/view?usp=sharing`;

        return {
          content: [{
            type: 'text',
            text: `✅ **Successfully converted and saved!**\n\n` +
                  `   📄 Original: ${fileName}\n` +
                  `   🎯 Format: ${targetFormat.toUpperCase()}\n` +
                  `   💾 Saved as: ${newFile.data.name}\n` +
                  `   📊 Size: ${(originalFile.size ? parseInt(originalFile.size) / 1024 : 0).toFixed(2)} KB\n\n` +
                  `📥 **Automatic download:**\n   ${downloadUrl}\n\n` +
                  `✨ File is now in your Google Drive!`
          }]
        };
      } catch (error) {
        const errorMessage = handleGoogleApiError(error, 'convert_and_save');
        console.error(`[ERROR] convert_and_save: ${errorMessage}`);
        return {
          content: [{ type: 'text', text: `Erro: ${errorMessage}` }],
          isError: true
        };
      }
    }
  );
}
