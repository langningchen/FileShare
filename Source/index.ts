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
			let Database = EnvironmentData.FileShareBufferDatabase;
			let RequestPath = new URL(RequestData.url).pathname;
			if (RequestPath === "/" && RequestData.method === "GET") {
				return new Response(Template, {
					headers: {
						"content-type": "text/html;charset=UTF-8",
					},
				});
			}
			if (RequestPath === "/DownloadFile" && RequestData.method === "GET") {
				let RequestQuery = new URL(RequestData.url).searchParams;
				let Filename: string = RequestQuery.get("Filename") || "";
				let GithubResponse = await Github.repos.getContent({
					owner: GithubOwner,
					repo: GithubRepo,
					path: Filename,
				});
				if (GithubResponse["data"]["message"] !== undefined) {
					return new Response(GithubResponse["data"]["message"], {
						headers: {
							"content-type": "text/plain;charset=UTF-8",
						},
					});
				}
				if (GithubResponse["data"]["content"] === undefined) {
					return new Response("File not found", {
						headers: {
							"content-type": "text/plain;charset=UTF-8",
						},
					});
				}
				let FileData = GithubResponse["data"]["content"];
				let FileDataString = atob(FileData);
				let FileDataUint8Array = new Uint8Array(FileDataString.length);
				for (let Index = 0; Index < FileDataString.length; Index++) {
					FileDataUint8Array[Index] = FileDataString.charCodeAt(Index);
				}
				return new Response(FileDataUint8Array, {
					headers: {
						"content-type": "application/octet-stream",
						"content-disposition": "attachment; filename=" + Filename,
					},
				});
			}
			let ResponseJSONData: ResponseJSON = await (async (): Promise<ResponseJSON> => {
				if (RequestPath === "/UploadFileStart" && RequestData.method === "POST") {
					let RequestBody: JSON;
					try {
						RequestBody = await RequestData.json();
					} catch (ParseError) {
						return new ResponseJSON(false, "Request body is not a valid JSON", {});
					}
					let SQLResult =
						await Database.prepare("INSERT INTO file_list (file_name) VALUES (?)")
							.bind(RequestBody["Filename"])
							.all();
					return new ResponseJSON(true, "", {
						FileID: SQLResult["meta"]["last_row_id"],
					});
				}
				else if (RequestPath === "/UploadFileChunk" && RequestData.method === "POST") {
					let RequestBody: JSON;
					try {
						RequestBody = await RequestData.json();
					} catch (ParseError) {
						return new ResponseJSON(false, "Request body is not a valid JSON", {});
					}
					let SQLResult =
						await Database.prepare("INSERT INTO file_chunk (file_id, content) VALUES (?, ?)")
							.bind(RequestBody["FileID"], RequestBody["Content"])
							.all();
					return new ResponseJSON(true, "", {});
				}
				else if (RequestPath === "/UploadFileEnd" && RequestData.method === "POST") {
					let RequestBody: JSON;
					try {
						RequestBody = await RequestData.json();
					} catch (ParseError) {
						return new ResponseJSON(false, "Request body is not a valid JSON", {});
					}
					let SQLResult =
						await Database.prepare("SELECT file_name FROM file_list WHERE id = ?")
							.bind(RequestBody["FileID"])
							.all();
					if (SQLResult.results.length === 0) {
						return new ResponseJSON(false, "File not found", {});
					}
					let Filename: string = SQLResult.results[0]["file_name"] as string;
					SQLResult =
						await Database.prepare("SELECT content FROM file_chunk WHERE file_id = ? ORDER BY id ASC")
							.bind(RequestBody["FileID"])
							.all();
					let FileData = "";
					for (let Row of SQLResult.results) {
						FileData += Row["content"];
					}
					let GithubResponse = await Github.repos.createOrUpdateFileContents({
						owner: GithubOwner,
						repo: GithubRepo,
						path: Filename,
						message: "Upload " + RequestBody["Filename"],
						content: FileData,
					});
					if (GithubResponse["data"]["content"] === undefined) {
						return new ResponseJSON(false, GithubResponse["data"]["message"], {});
					}
					await Database.prepare("DELETE FROM file_chunk WHERE file_id = ?")
						.bind(RequestBody["FileID"])
						.run();
					await Database.prepare("DELETE FROM file_list WHERE id = ?")
						.bind(RequestBody["FileID"])
						.run();
					return new ResponseJSON(true, "", {});
				}
				else if (RequestPath === "/GetFileList" && RequestData.method === "GET") {
					let GithubResponse = await Github.repos.getContent({
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
					let ResponseData: FileData[] = [];
					for (let File of GithubResponse["data"]) {
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
					let RequestBody;
					try {
						RequestBody = await RequestData.json();
					} catch (ParseError) {
						return new ResponseJSON(false, "Request body is not a valid JSON", {});
					}
					let GithubResponse = await Github.repos.getContent({
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
					let DeleteGithubResponse = await Github.repos.deleteFile({
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
				else {
					return new ResponseJSON(false, "Not found", {});
				}
			})();
			return new Response(JSON.stringify(ResponseJSONData), {
				headers: {
					"content-type": "text/plain;charset=UTF-8",
				},
			});
		} catch (Error) {
			return new Response(JSON.stringify(new ResponseJSON(false, Error.message, {})), {
				headers: {
					"content-type": "text/plain;charset=UTF-8",
				},
			});
		}
	}
};
