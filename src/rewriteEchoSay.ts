import {CommandList, Argument} from "./parsing/Node.js";

export function rewriteEchoSay (commands: CommandList)
{
	// 1. quote everything
	// 2. merge adjacent quotes
	// 3. unquote as much as possible
	
	for (const {command} of commands.findAll(["echo", "say"]))
	{
		const allquoted = [...command].slice(1).map(arg => {
			
			if (!arg.isArgument())
				return arg;
			
			if (arg.isQuoted())
				return arg;
			
			return Argument.create({
				value: arg.getString(),
				quoted: true,
			});
		});
		
		for (let i = 0; i < allquoted.length - 1; i++)
		{
			const thisarg = allquoted[i];
			const nextarg = allquoted[i + 1];
			
			if (!thisarg.isArgument() || !nextarg.isArgument())
				continue;
			
			// both are args
			
			allquoted[i] = Argument.create({
				value: thisarg.getString() + " " + nextarg.getString(),
				quoted: true,
			});
			
			allquoted.splice(i + 1, 1);
			i--;
		}
		
		// now unquote
		
		for (let i = 0; i < allquoted.length; i++)
		{
			const thisarg = allquoted[i];
			
			if (!thisarg.isArgument())
				continue;
			
			if (Argument.stringNeedsQuotes(thisarg.getString()))
			{
				continue;
			}
			
			allquoted[i] = Argument.fromString(thisarg.getString());
		}
		
		check:
		if (allquoted.length === 1)
		{
			const parts = allquoted[0].getArgument().getString().split(" ");
			
			if (!parts.every(s => !Argument.stringNeedsQuotes(s)))
				break check;
			
			allquoted.splice(0, 1,
				...parts.map(part => Argument.fromString(part)))
		}
		
		command.spliceArguments(1, Infinity, ...allquoted);
	}
}