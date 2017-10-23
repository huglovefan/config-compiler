import {CommandList} from "./parsing/Node.js";

export function rewriteDo (commands: CommandList)
{
	for (const {command, parentBlock} of commands.findAll("do"))
	{
		const block = command.argv(1).getCommandList();
		parentBlock.replaceChild(command, ...block);
	}
}