# MCP Google Workers

A custom Model Context Protocol (MCP) server that enables any MCP client to interact with Google Workspace (Gmail, Drive, Calendar).

## 🌟 What is this?

This is a standalone MCP server that provides tools for Google Workspace integration. It can be used with **any MCP-compatible client** including:
- [Claude Code](https://github.com/anthropics/claude-code)
- [Cursor](https://cursor.com)
- [Windsurf](https://windsurf.ai)
- Any other MCP-compatible AI assistant

## 🚀 Features

- **📧 Gmail Integration**: List recent emails from your inbox
- **📁 Google Drive Management**: Create, read, move, copy, delete, and search files and folders
- **📅 Google Calendar Access**: View upcoming events
- **🔄 File Conversion**: Convert files between various formats
- **🔐 Secure Authentication**: OAuth 2.0 authentication with Google

## 🛠 Available Tools

### Gmail
| Tool | Description | Parameters |
|------|-------------|------------|
| `list_emails` | List recent emails from inbox | `limit` (optional, default: 5) |

### Google Drive
| Tool | Description | Parameters |
|------|-------------|------------|
| `list_files` | List files/folders with filters | `limit`, `type`, `folderName` |
| `list_folder` | List contents of a specific folder | `folderId`, `limit` |
| `search_files` | Search files by name | `query`, `limit` |
| `create_folder` | Create a new folder | `name` |
| `create_file` | Create text file with content | `fileName`, `content`, `parentId` |
| `upload_file` | Upload local file to Drive | `filePath`, `fileName`, `parentId` |
| `download_file` | Generate download link | `fileName` |
| `read_file` | Read content of text files | `fileName` |
| `convert_file` | Convert between formats | `fileName`, `targetFormat`, `newFileName` |
| `convert_and_save` | Convert and save in Drive | `fileName`, `targetFormat`, `saveFileName` |
| `read_file_metadata` | Read file metadata by ID | `fileId` |
| `rename_file` | Rename file/folder | `fileId`, `newName` |
| `move_file` | Move file between folders | `fileId`, `newParentId` |
| `copy_file` | Duplicate a file | `fileId`, `newFileName` |
| `delete_file` | Move file to trash | `fileId` |
| `delete_permanently` | Permanently delete from trash | `fileId` |
| `restore_file` | Restore file from trash | `fileId` |
| `list_trash` | List files in trash | `limit` |

### Google Calendar
| Tool | Description | Parameters |
|------|-------------|------------|
| `list_events` | List upcoming calendar events | `limit`, `days` |

## 📦 Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Google Cloud Platform account

### Step 1: Set Up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Gmail API
   - Google Drive API
   - Google Calendar API
4. Go to **OAuth consent screen**:
   - Select "External"
   - Fill in app name, user support email, and developer contact
   - Skip "Test users" (leave empty for public use)
   - Click "Save and Continue"
5. Go to **Credentials**:
   - Click "+ CREATE CREDENTIALS"
   - Choose "OAuth client ID"
   - Select "Desktop app" as application type
   - Download the JSON file

### Step 2: Install the Server

```bash
# Clone or download this repository
git clone https://github.com/Ravi4649/mcp-google-workers.git
cd mcp-google-workers

# Install dependencies
npm install

# Build the project
npm run build
```

### Step 3: Configure Credentials

Copy your downloaded OAuth JSON file to the project directory:
```bash
cp ~/Downloads/client_secret_XXXXX.json credentials.json
```

### Step 4: Connect to Your MCP Client

Configure your MCP client to use this server. Example configuration:

```json
{
  "mcpServers": {
    "google-workers": {
      "command": "node",
      "args": ["/path/to/mcp-google-workers/dist/index.js"],
      "env": {}
    }
  }
}
```

## 🔐 First-Time Authentication

When you first use any Google-related tool:
1. The server will display an authentication URL
2. Open the URL in your browser
3. Log in with your Google account
4. You may see a "**This app isn't verified**" warning (normal for development apps)
   - Click "Advanced" → "Go to ... (unsafe)" to proceed
5. Click "Allow"
6. Copy the authorization code and paste it in the terminal
7. The token will be saved in `token.json` for future use

> 💡 **Note:** Since this is a development app, you may need to re-authenticate every 7 days. To avoid this, you can publish the app to "Production" in Google Cloud Console (requires verification process).

## 🔐 Privacy & Security

- **100% local**: Runs on your machine via Stdio
- **Zero external data**: Credentials and tokens stay on your machine
- **No backend**: Direct communication with Google API
- **OAuth 2.0**: Industry-standard authentication

## 🛠 Tech Stack

- TypeScript + Node.js
- Google APIs Client Library (`googleapis`)
- MCP SDK (`@modelcontextprotocol/sdk`)
- Zod for validation
- OAuth 2.0 for authentication

## 🔄 Updating

To update to the latest version:
```bash
git pull origin main
npm install
npm run build
```

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Model Context Protocol](https://modelcontextprotocol.io/)
- Uses [googleapis](https://github.com/googleapis/google-api-nodejs-client) for Google API integration