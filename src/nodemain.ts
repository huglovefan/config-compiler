import {Compiler} from "./Compiler.js";

declare const require: any;
declare const process: any;

const fs = require("fs");

if (process.argv.length < 3)
	throw new Error("no input file");

const text = fs.readFileSync(process.argv[2]).toString();

console.log(new Compiler(text).getString());