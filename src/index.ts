/**********************************************************************
FileShare: Share files using Cloudflare Workers and GitHub Private Repositories!
Copyright (C) 2025  langningchen

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
**********************************************************************/

import { Octokit } from '@octokit/rest';
import { KVNamespace } from '@cloudflare/workers-types';
import { randomUUID } from 'node:crypto';

export interface Env {
	fileShare: KVNamespace;
	GithubPAT: string;
	GithubOwner: string;
	GithubRepo: string;
	GithubBranch: string;
}
class ResJson {
	Succeeded: boolean;
	Message: string;
	Data: Object;
	constructor(Succeeded: boolean, Message: string, Data: Object) {
		this.Succeeded = Succeeded;
		this.Message = Message;
		this.Data = Data;
	}
}

interface File {
	filename: string;
	fileId: string;
	chunks?: number;
	size?: number;
	uploading?: boolean;
	admin: boolean;
}

export default {
	async fetch(req: Request, env: Env, ctx): Promise<Response> {
		try {
			const path: string = new URL(req.url).pathname;
			const resJson: ResJson | Response = await (async (): Promise<ResJson | Response> => {
				if (env.GithubPAT === undefined ||
					env.GithubOwner === undefined ||
					env.GithubRepo === undefined ||
					env.GithubBranch === undefined) {
					return new ResJson(false, 'Please set the environment variables', {});
				}

				const owner = env.GithubOwner;
				const repo = env.GithubRepo;
				const connectingIp = req.headers.get('CF-Connecting-IP') || 'localhost';

				const github = new Octokit({ auth: env.GithubPAT, userAgent: 'Cloudflare Worker', });
				let requestBody: JSON;
				requestBody = await req.json();
				if (req.method !== 'POST') { return new ResJson(false, 'Method not allowed', {}); }
				if (path === '/list') {
					const files: File[] = [];
					const keys = await env.fileShare.list();
					for (const key of keys.keys) {
						const fileId = key.name.split(':')[0];
						if (key.name.endsWith(':uploaded')) {
							const filename = (await env.fileShare.get(`${fileId}:filename`))!;
							const ip = (await env.fileShare.get(`${fileId}:ip`))!;
							const chunks = parseInt((await env.fileShare.get(`${fileId}:chunks`))!);
							const size = parseInt((await env.fileShare.get(`${fileId}:size`))!);
							files.push({ filename, fileId, chunks, size, admin: connectingIp === ip });
						} else if (key.name.endsWith(':uploading')) {
							const filename = (await env.fileShare.get(`${fileId}:filename`))!;
							const ip = (await env.fileShare.get(`${fileId}:ip`))!;
							files.push({ filename, fileId, uploading: true, admin: connectingIp === ip });
						}
					}
					console.log(files);
					return new ResJson(true, '', { files, });
				}
				else if (path === '/start') {
					const fileId = randomUUID();
					await env.fileShare.put(`${fileId}:chunks`, `0`);
					await env.fileShare.put(`${fileId}:filename`, requestBody['filename']);
					await env.fileShare.put(`${fileId}:size`, `0`);
					await env.fileShare.put(`${fileId}:uploading`, `1`);
					await env.fileShare.put(`${fileId}:ip`, connectingIp);
					return new ResJson(true, '', { fileId, });
				}
				else if (path === '/chunk') {
					const fileId = requestBody['fileId'];
					if (await env.fileShare.get(`${fileId}:uploading`) === null) {
						return new ResJson(false, 'File not found', {});
					}
					const chunkId = parseInt((await env.fileShare.get(`${fileId}:chunks`))!);
					const size = parseInt((await env.fileShare.get(`${fileId}:size`))!);
					const content = requestBody['content'];
					const githubResponse = await github.repos.createOrUpdateFileContents({
						owner, repo,
						path: `${fileId}/${chunkId}`,
						message: `Upload ${fileId}/${chunkId} from ${connectingIp}`,
						content: content,
					});
					if (githubResponse['data']['content'] === undefined) {
						return new ResJson(false, githubResponse['data']['message'], {});
					}
					await env.fileShare.put(`${fileId}:chunks`, (chunkId + 1).toString());
					await env.fileShare.put(`${fileId}:size`, (size + content.length).toString());
					return new ResJson(true, '', {});
				}
				else if (path === '/end') {
					const fileId = requestBody['fileId'];
					if (!fileId || (await env.fileShare.get(`${fileId}:uploading`)) === null) {
						return new ResJson(false, 'File not found', {});
					}
					await env.fileShare.delete(`${fileId}:uploading`);
					await env.fileShare.put(`${fileId}:uploaded`, `1`);
					return new ResJson(true, '', {});
				}
				else if (path === '/delete') {
					const fileId = requestBody['fileId'];
					if (!fileId ||
						((await env.fileShare.get(`${fileId}:uploaded`)) === null &&
							await env.fileShare.get(`${fileId}:uploading`) === null)) {
						return new ResJson(false, 'File not found', {});
					}
					const ip = (await env.fileShare.get(`${fileId}:ip`))!;
					if (connectingIp !== ip) { return new ResJson(false, 'Permission denied', {}); }
					const currentCommitSha = (await github.git.getRef({ owner, repo, ref: `heads/${env.GithubBranch}`, })).data.object.sha;
					const treeSha = (await github.git.getCommit({ owner, repo, commit_sha: currentCommitSha, })).data.tree.sha;
					const folders = (await github.git.getTree({ owner, repo, tree_sha: treeSha, })).data.tree.filter((item: any) => item.path == fileId);
					if (folders.length !== 0) {
						const folderSha = folders[0].sha!;
						const oldTree = (await github.git.getTree({ owner, repo, tree_sha: folderSha, })).data.tree;
						const newTree = oldTree.map(({ path, mode, type }) => ({ path: `${fileId}/${path}`, sha: null, mode, type }));
						const newTreeSha = (await github.git.createTree({ owner, repo, base_tree: treeSha, tree: newTree as any, })).data.sha;
						const newCommitSha = (await github.git.createCommit({
							owner, repo,
							message: `Delete ${fileId} from ${connectingIp}`,
							tree: newTreeSha,
							parents: [currentCommitSha],
						})).data.sha;
						await github.git.updateRef({ owner, repo, ref: `heads/${env.GithubBranch}`, sha: newCommitSha, });
					}

					await env.fileShare.delete(`${requestBody['fileId']}:chunks`);
					await env.fileShare.delete(`${requestBody['fileId']}:size`);
					await env.fileShare.delete(`${requestBody['fileId']}:filename`);
					await env.fileShare.delete(`${requestBody['fileId']}:uploaded`);
					await env.fileShare.delete(`${requestBody['fileId']}:uploading`);
					await env.fileShare.delete(`${requestBody['fileId']}:ip`);
					return new ResJson(true, '', {});
				}
				else if (path === '/download') {
					const fileId = requestBody['fileId'];
					const chunk = requestBody['chunk'];
					if (typeof fileId !== 'string' || (await env.fileShare.get(`${fileId}:uploaded`)) === null) { return new ResJson(false, 'File not found', {}); }
					const chunks = parseInt((await env.fileShare.get(`${fileId}:chunks`))!);
					if (typeof chunk !== 'number' || chunk >= chunks) { return new ResJson(false, 'Chunk not found', {}); }
					const githubResponse = await fetch(`https://raw.githubusercontent.com/${env.GithubOwner}/${env.GithubRepo}/${env.GithubBranch}/${fileId}/${chunk}`, {
						headers: { 'Authorization': `token ${env.GithubPAT}`, },
					});
					if (!githubResponse.ok) { return new ResJson(false, 'Not found', {}); }
					const responseData: ArrayBuffer = await githubResponse.arrayBuffer();
					return new Response(responseData, { headers: { 'content-type': 'application/octet-stream', }, });
				}
				return new ResJson(false, 'Not found', {});
			})();
			if (resJson instanceof Response) { return resJson; }
			return new Response(JSON.stringify(resJson), { headers: { 'content-type': 'application/json;charset=UTF-8', }, });
		} catch (Error) {
			return new Response(JSON.stringify(new ResJson(false, Error.message, {})), { headers: { 'content-type': 'application/json;charset=UTF-8', }, });
		}
	}
};
