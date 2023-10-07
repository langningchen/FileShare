/**********************************************************************
FileShare: Share files using Cloudflare Workers and GitHub Private Repositories!
Copyright (C) 2023  langningchen

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

import Template from "./Template.html";
import { GithubPAT, GithubOwner, GithubRepo } from "./Secret";
import { Octokit } from "@octokit/rest";
import { D1Database } from "@cloudflare/workers-types";

export interface Environment {
	FileShareBufferDatabase: D1Database;
}
class ResponseJSON {
	Succeeded: boolean;
	Message: string;
	Data: Object;
	constructor(Succeeded: boolean, Message: string, Data: Object) {
		this.Succeeded = Succeeded;
		this.Message = Message;
		this.Data = Data;
	}
}

const Github = new Octokit({
	auth: GithubPAT,
	userAgent: "Cloudflare Worker",
});

export default {
	async fetch(RequestData: Request, EnvironmentData: Environment, Context): Promise<Response> {
		try {
			const Database: D1Database = EnvironmentData.FileShareBufferDatabase;
			const RequestPath: string = new URL(RequestData.url).pathname;
			const ResponseJSONData: ResponseJSON | Response = await (async (): Promise<ResponseJSON | Response> => {
				let RequestBody: JSON;
				try {
					RequestBody = await RequestData.json();
				} catch (ParseError) {
					RequestBody = JSON.parse("{}");
				}
				if (RequestPath === "/" && RequestData.method === "GET") {
					return new Response(Template, {
						headers: {
							"content-type": "text/html;charset=UTF-8",
						},
					});
				}
				else if (RequestPath === "/UploadFileStart" && RequestData.method === "POST") {
					const SQLResult =
						await Database.prepare("INSERT INTO file_list (file_name) VALUES (?)")
							.bind(RequestBody["Filename"])
							.all();
					return new ResponseJSON(true, "", {
						FileID: SQLResult["meta"]["last_row_id"],
					});
				}
				else if (RequestPath === "/UploadFileChunk" && RequestData.method === "POST") {
					/**
					 * Because of Cloudflare D1 free has a 1MB string size limit,
					 * so we have to split the file chunks into 1MB.
					 * But we have to make sure that the data is small enough to be stored in the database,
					 * so we set the limit to 512KB.
					 * https://developers.cloudflare.com/d1/platform/limits/
					 */
					const SizeLimit = 1024 * 512;
					for (let i = 0; i < RequestBody["Content"].length; i += SizeLimit) {
						await Database.prepare("INSERT INTO file_chunk (file_id, content) VALUES (?, ?)")
							.bind(RequestBody["FileID"], RequestBody["Content"].substr(i, SizeLimit))
							.all();
					}
					return new ResponseJSON(true, "", {});
				}
				else if (RequestPath === "/UploadFileEnd" && RequestData.method === "POST") {
					const SelectSQLResult =
						await Database.prepare("SELECT file_name FROM file_list WHERE id = ?")
							.bind(RequestBody["FileID"])
							.all();
					if (SelectSQLResult.results.length === 0) {
						return new ResponseJSON(false, "File not found", {});
					}
					const Filename: string = SelectSQLResult.results[0]["file_name"] as string;
					const ContentSQLResult =
						await Database.prepare("SELECT content FROM file_chunk WHERE file_id = ? ORDER BY id ASC")
							.bind(RequestBody["FileID"])
							.all();
					let FileData = "";
					for (const Row of ContentSQLResult.results) {
						FileData += Row["content"];
					}
					const GithubResponse = await Github.repos.createOrUpdateFileContents({
						owner: GithubOwner,
						repo: GithubRepo,
						path: Filename,
						message: "Upload " + RequestBody["Filename"],
						content: FileData,
					});
					if (GithubResponse["data"]["content"] === undefined) {
						return new ResponseJSON(false, GithubResponse["data"]["message"], {});
					}
					// Delete file chunks first to avoid foreign key constraint
					await Database.prepare("DELETE FROM file_chunk WHERE file_id = ?")
						.bind(RequestBody["FileID"])
						.run();
					await Database.prepare("DELETE FROM file_list WHERE id = ?")
						.bind(RequestBody["FileID"])
						.run();
					return new ResponseJSON(true, "", {});
				}
				else if (RequestPath === "/GetFileList" && RequestData.method === "GET") {
					const GithubResponse = await Github.repos.getContent({
						owner: GithubOwner,
						repo: GithubRepo,
						path: "",
					});
					if (GithubResponse["data"]["message"] !== undefined) {
						return new ResponseJSON(false, GithubResponse["data"]["message"], {});
					}
					interface FileData {
						Filename: string;
						FileSize: number;
					}
					const ResponseData: FileData[] = [];
					for (const File of GithubResponse["data"]) {
						if (File["type"] === "file") {
							ResponseData.push({
								Filename: File["name"],
								FileSize: File["size"],
							});
						}
					}
					return new ResponseJSON(true, "", {
						FileList: ResponseData,
					});
				}
				else if (RequestPath === "/DeleteFile" && RequestData.method === "POST") {
					const GithubResponse = await Github.repos.getContent({
						owner: GithubOwner,
						repo: GithubRepo,
						path: RequestBody["Filename"],
					});
					if (GithubResponse["data"]["message"] !== undefined) {
						return new ResponseJSON(false, GithubResponse["data"]["message"], {});
					}
					if (GithubResponse["data"]["sha"] === undefined) {
						return new ResponseJSON(false, "File not found", {});
					}
					const DeleteGithubResponse = await Github.repos.deleteFile({
						owner: GithubOwner,
						repo: GithubRepo,
						path: RequestBody["Filename"],
						message: "Delete " + RequestBody["Filename"],
						sha: GithubResponse["data"]["sha"],
					});
					if (DeleteGithubResponse["data"]["message"] !== undefined) {
						return new ResponseJSON(false, DeleteGithubResponse["data"]["message"], {});
					}
					return new ResponseJSON(true, "", {});
				}
				else if (RequestPath === "/DownloadFile" && RequestData.method === "POST") {
					const Filename: string = RequestBody["Filename"];
					const GithubResponse = await Github.repos.getContent({
						owner: GithubOwner,
						repo: GithubRepo,
						path: Filename,
					});
					if (GithubResponse["data"]["message"] !== undefined) {
						return new ResponseJSON(false, GithubResponse["data"]["message"], {});
					}
					const DownloadURL: string = GithubResponse["data"]["download_url"];
					let DownloadResponse: Response;
					if (RequestData.headers.get("range") === null) {
						DownloadResponse = await fetch(DownloadURL);
					}
					else {
						DownloadResponse = await fetch(DownloadURL, {
							headers: {
								"range": RequestData.headers.get("range") as string,
							},
						});
					}
					const DownloadData = await DownloadResponse.blob();
					return new Response(DownloadData, {
						headers: {
							"content-type": DownloadResponse.headers.get("content-type") as string,
							"content-range": DownloadResponse.headers.get("content-range") as string,
							"content-length": DownloadResponse.headers.get("content-length") as string,
						},
					});
				}
				else {
					return new ResponseJSON(false, "Not found", {});
				}
			})();
			if (ResponseJSONData instanceof Response)
				return ResponseJSONData;
			return new Response(JSON.stringify(ResponseJSONData), {
				headers: {
					"content-type": "application/json;charset=UTF-8",
				},
			});
		} catch (Error) {
			return new Response(JSON.stringify(new ResponseJSON(false, Error.message, {})), {
				headers: {
					"content-type": "application/json;charset=UTF-8",
				},
			});
		}
	}
};
