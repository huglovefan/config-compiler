import * as fs from "fs";

import {Compiler} from "../Compiler.js";

fs.readdir("./test/cfg2", (err, files) =>
{
	if (err !== null)
		throw err;
	
	for (const file of files)
	{
		if (!file.endsWith(".cfg2"))
			continue;
		
		const cfgFile = file.replace(/\.cfg2$/, ".cfg");
		const jsonFile = file.replace(/\.cfg2$/, ".json");
		
		const filePath = "./test/cfg2/" + file;
		const cfgFilePath = "./test/cfg/" + cfgFile;
		const jsonFilePath = "./test/json/" + jsonFile;
		
		fs.readFile(filePath, (err, data) =>
		{
			if (err !== null)
				throw err;
			
			const text = data.toString();
			const compiler = new Compiler(text);
			
			console.log("\n");
			console.log("compiling %s...", file);
			compiler.getCommands();
			console.log("\n");
			
			fs.readFile(cfgFilePath, (err, data) =>
			{
				if (err !== null && err.code !== "EEXIST")
					throw err;
				
				const cfg = data.toString();
				
				console.assert(cfg === compiler.getString(),
					`compiled output of ${filePath} equals ${cfgFilePath}`);
			});
			
			fs.readFile(jsonFilePath, (err, data) =>
			{
				if (err !== null && err.code !== "EEXIST")
					throw err;
				
				const json = data.toString();
				
				console.assert(json === JSON.stringify(compiler.getCommands(), null, "  "),
					`compiled output of ${filePath} equals ${jsonFilePath}`);
			});
		});
	}
});