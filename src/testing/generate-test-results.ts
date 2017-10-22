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
		
		fs.readFile("./test/cfg2/" + file, (err, data) =>
		{
			if (err !== null)
				throw err;
			
			const text = data.toString();
			const compiler = new Compiler(text);
			
			console.log(" ");
			console.log("compiling %s...", file);
			compiler.getCommands();
			console.log(" ");
			
			fs.mkdir("./test/cfg/", (err) =>
			{
				if (err !== null && err.code !== "EEXIST")
					throw err;
				
				const cfg = compiler.getString();
				
				fs.writeFile("./test/cfg/" + cfgFile, cfg, (err) =>
				{
					if (err !== null)
						throw err;
				});
			});
			
			fs.mkdir("./test/json/", (err) =>
			{
				if (err !== null && err.code !== "EEXIST")
					throw err;
				
				const json = JSON.stringify(compiler.getCommands(), null, "  ");
				
				fs.writeFile("./test/json/" + jsonFile, json, (err) =>
				{
					if (err !== null)
						throw err;
				});
			});
		});
	}
});