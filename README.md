# FileShare

## Introduction

Share files using Cloudflare Workers and GitHub Private Repositories!

## Usage

1. Clone this repository
2. [Create a new GitHub Personal Access Token](https://github.com/settings/tokens/new) with the `repo` scope
3. [Create a private repository](https://github.com/new?name=FileShare-Data&description=Store%20data%20for%20FileShare&visibility=private) to store your files
4. Make sure you have `npm` and `wrangler` installed and configured
5. Create a new KV namespace by running `wrangler kv namespace create fileShare`
6. Update file `wrangler.toml`:

```toml
name = "file-share"
main = "src/index.ts"
compatibility_flags = [ "nodejs_compat" ]
compatibility_date = "2023-10-02"
assets = { directory = "./public" }

[placement]
mode = "smart"

[[kv_namespaces]]
binding = "fileShare"
id = "..." // The ID of the kv you created, output in step 5
```

9. Run `npm install` to install dependencies
10. Run `wrangler deploy` to publish your project
11. Run `wrangler secret put GithubPAT`, `wrangler secret put GithubOwner`, `wrangler secret put GithubRepo`, `wrangler secret put GithubBranch` to store your GitHub Personal Access Token, GitHub Owner, GitHub Repository and GitHub Branch respectively
12. Your file share is now live! 🎉

## License

This project is licensed under the terms of the GNU General Public License v3.0.
