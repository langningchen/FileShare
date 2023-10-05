# FileShare

## Introduction

Share files using Cloudflare Workers and GitHub Private Repositories!

## Usage

1. Clone this repository
2. Create a new GitHub Personal Access Token with the `repo` scope
3. Create a private repository to store your files
4. Create a file named `Secret.ts` in the `Source` directory with the following contents:

```ts
export const GithubPAT = "ghp_..."; // Your GitHub Personal Access Token
export const GithubOwner = "..."; // Your GitHub username
export const GithubRepo = "..."; // The name of the repository you created
```

5. Make sure you have npm and Wrangler installed and configured
6. Create a new Cloudflare Workers project by running `npm create cloudflare@latest`
7. Create a new D1 Database by running `wrangler d1 create <name>`
8. Upload file `wrangler.toml`:

```toml
name = "..." // Your project name
main = "Source/index.ts"
compatibility_date = "2023-10-02"

[[d1_databases]]
binding = "FileShareBufferDatabase"
database_name = "..." // The name of the database you created
database_id = "..." // The ID of the database you created
```

9. Run `wrangler d1 execute <name> --file=Source/Initial.sql` to initialize the database
10. Run `npm install` to install dependencies
11. Run `wrangler publish` to publish your project
12. :tada: Your file share is now live!

## License

This project is licensed under the terms of the GNU General Public License v3.0.
