# gws-tools

A command-line tool for Google Workspace admins to find and clean up duplicate files in Shared Drives.

Scans a Shared Drive via the Google Drive API, stores file metadata locally in SQLite, identifies duplicates by MD5 hash and name/size, lets you review them interactively, and removes approved copies — either to Trash or permanently.

## Requirements

- **Node.js** >= 20
- A **Google Cloud project** with the Drive API enabled
- An **OAuth 2.0 Desktop client** credential (`credentials.json`)
- Google Workspace **admin** or **manager** access to the target Shared Drive

## Setup

### 1. Clone and install

```bash
git clone https://github.com/cleichsenring/GoogleWorkspaceAdminCLITools
cd gws-tools
npm install
```

### 2. Create a Google Cloud OAuth credential

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable the **Google Drive API** under *APIs & Services → Library*.
3. Go to *APIs & Services → Credentials → Create Credentials → OAuth client ID*.
4. Choose **Desktop app**, give it a name, and click Create.
5. Download the JSON file and save it as **`credentials.json`** in the project root.

> **Security:** `credentials.json` and any generated token files are excluded from git via `.gitignore`. Never commit them.

### 3. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

`.env` options:

| Variable | Description | Default |
|---|---|---|
| `GWS_DRIVE_ID` | Shared Drive ID (from the Drive URL) | — |
| `GWS_DATA_DIR` | Directory for the SQLite database and reports | `./data` |
| `GWS_LOG_LEVEL` | Log verbosity: `debug`, `info`, `warn`, `error` | `info` |

The Drive ID is the long string in the URL when you open a Shared Drive:
`https://drive.google.com/drive/folders/**<DRIVE_ID>**`

### 4. First-run authorization

The first time you run any command, a browser window will open asking you to sign in with a Google account that has access to the target Shared Drive. After approving, tokens are saved locally and reused automatically (with silent refresh).

## Quick start

```bash
# 1. Find your Shared Drive ID
node src/index.js drives

# 2. Scan the drive (runs path resolution automatically after)
node src/index.js scan --drive-id <DRIVE_ID>

# 3. Find duplicates (default strategy: keep oldest-created copy)
node src/index.js analyze --drive-id <DRIVE_ID>

# 4. Generate a CSV report
node src/index.js report --drive-id <DRIVE_ID>

# 5. Optionally review interactively before deleting
node src/index.js review --drive-id <DRIVE_ID>

# 6. Move approved duplicates to Trash (safe default)
node src/index.js clean --drive-id <DRIVE_ID> --dry-run
node src/index.js clean --drive-id <DRIVE_ID>
```

## Commands

### `drives`

List Shared Drives your account has access to.

```
gws-tools drives [--list]
```

| Option | Description |
|---|---|
| `--list` | Print drives without interactive picker |

### `scan`

Scan a Shared Drive and store all file metadata locally in SQLite. Supports resuming interrupted scans.

```
gws-tools scan --drive-id <id> [options]
```

| Option | Description | Default |
|---|---|---|
| `--drive-id <id>` | **Required.** Shared Drive ID | `GWS_DRIVE_ID` env |
| `--resume` | Resume an interrupted scan | — |
| `--force` | Discard existing scan and start fresh | — |
| `--resolve-paths` / `--no-resolve-paths` | Resolve full folder paths after scan | `true` |

Scanned metadata is written to `data/scan.db` (SQLite). Large drives can take several minutes; use `--resume` if interrupted.

### `analyze`

Detect duplicate files from the last scan and mark which copies to keep or delete.

```
gws-tools analyze --drive-id <id> [options]
```

| Option | Description | Default |
|---|---|---|
| `--drive-id <id>` | Shared Drive ID | `GWS_DRIVE_ID` env |
| `--strategy <name>` | Keep strategy (see below) | `oldest-created` |
| `--min-size <bytes>` | Ignore files smaller than this | `0` |
| `--no-include-native` | Exclude Google Workspace native files (Docs, Sheets, etc.) | — |

#### Keep strategies

| Strategy | Description |
|---|---|
| `oldest-created` | Keep the file created earliest |
| `newest-modified` | Keep the file most recently modified |
| `shallowest-path` | Keep the file with the fewest folder levels |
| `manual` | Leave all copies as pending for manual review |

Duplicates are detected in two ways:
- **MD5 match** — identical content (binary files)
- **Name + size match** — same filename and byte count (Google-native files without MD5)

### `report`

Export duplicate findings to CSV or JSON.

```
gws-tools report --drive-id <id> [options]
```

| Option | Description | Default |
|---|---|---|
| `--drive-id <id>` | Shared Drive ID | `GWS_DRIVE_ID` env |
| `--format <type>` | `csv`, `json`, or `both` | `csv` |
| `--output <path>` | Custom output file path | `data/reports/` |
| `--summary-only` | Print summary stats without writing files | — |

Reports are written to `data/reports/` by default.

### `review`

Interactively step through each duplicate group and override keep/delete decisions.

```
gws-tools review --drive-id <id> [options]
```

| Option | Description | Default |
|---|---|---|
| `--drive-id <id>` | Shared Drive ID | `GWS_DRIVE_ID` env |
| `--start-from <id>` | Resume from a specific group ID | — |
| `--filter <type>` | Filter groups: `md5`, `name_size`, `all` | `all` |

For each group you can: keep a specific file, skip, or mark the entire group for deletion.

### `folders`

Analyze duplicate overlap at the folder level — useful for finding folders that are mostly redundant copies of each other.

```
gws-tools folders --drive-id <id> [options]
```

| Option | Description | Default |
|---|---|---|
| `--drive-id <id>` | Shared Drive ID | `GWS_DRIVE_ID` env |
| `--min-shared <n>` | Min shared duplicate groups to appear in overlap report | `3` |
| `--limit <n>` | Max folder pairs to display | `30` |
| `--review` | Interactively review folder pairs and mark for deletion | — |
| `--sort <by>` | Sort order for review: `size`, `depth`, `overlap` | `size` |

### `clean`

Execute the approved deletions from analysis/review.

```
gws-tools clean --drive-id <id> [options]
```

| Option | Description | Default |
|---|---|---|
| `--drive-id <id>` | Shared Drive ID | `GWS_DRIVE_ID` env |
| `--mode <mode>` | `trash` (recoverable) or `permanent` | `trash` |
| `--dry-run` | Show what would be deleted without making changes | — |
| `--batch-size <n>` | Parallel deletions per batch | `50` |
| `--confirm` | Skip the confirmation prompt | — |

> **Recommendation:** Always run with `--dry-run` first and review the output before deleting. Use `--mode trash` (the default) so files are recoverable from Trash.

### `resolve-paths`

Standalone command to (re-)resolve full folder paths for all scanned files. Normally runs automatically after `scan`.

```
gws-tools resolve-paths --drive-id <id> [--force]
```

### `status`

Show a summary of the current scan and analysis state for a drive.

```
gws-tools status --drive-id <id>
```

## Typical workflow

```
drives        →  find your drive ID
scan          →  pull all file metadata from the API into SQLite
analyze       →  detect duplicates, apply a keep strategy
report        →  export findings to CSV for review
review        →  (optional) override decisions interactively
folders       →  (optional) identify redundant folder trees
clean --dry-run  →  verify what will be deleted
clean         →  move approved copies to Trash
```

## Data and storage

All data is stored locally:

| Path | Contents |
|---|---|
| `data/scan.db` | SQLite database (files, duplicates, scan sessions) |
| `data/reports/` | CSV/JSON exports |
| `data/gws-tools.log` | Log file |
| `data/tokens.json` | OAuth tokens (auto-managed, gitignored) |

The `data/` directory is created automatically on first run and is excluded from git.

## Configuration file

In addition to environment variables, you can use a `gws-tools.config.js` (or `.json`, `.yaml`) in the project root. Settings in the config file are merged with the defaults in [config/default.js](config/default.js).

Example `gws-tools.config.js`:

```js
export default {
  drive: {
    rateLimiting: {
      concurrency: 1,
      intervalCap: 8,
      interval: 1000,
    },
  },
  analysis: {
    defaultStrategy: 'shallowest-path',
  },
};
```

## Running as a global CLI

You can install the tool globally to use `gws-tools` from anywhere:

```bash
npm install -g .
gws-tools drives
```

Or run without installing:

```bash
node src/index.js <command>
```

## Security notes

- `credentials.json` contains your OAuth client secret — keep it private.
- Tokens are stored in `data/tokens.json` and refreshed automatically.
- Both files are in `.gitignore` and should never be committed or shared.
- The tool only requests the `https://www.googleapis.com/auth/drive` scope. Consider using a dedicated Google account with only the access needed.
- Permanent deletion (`--mode permanent`) is irreversible. Always prefer `--mode trash` unless you are certain.

## License

MIT — see [LICENSE](LICENSE).
