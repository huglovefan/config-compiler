import {CommandList, Command, Argument} from "./parsing/Node.js";
import {CFGError} from "./errors.js";

import Scope from "./interpreter/Scope.js";

/*

template <name> [...parameters] <body>

feature roadmap:
- done: passing templates to templates (capture declaration scope)
- spread args (at most one, doesn't have to be last)

todo:
- there should only be one scope with a ScopeItem class & errors for using the wrong type in cfg2

*/

//
//
//

enum ScopeItemType
{
	NODE,
	SPREAD,
	TEMPLATE,
}

abstract class ScopeItem <TType extends ScopeItemType, TValue>
{
	protected abstract readonly type: TType;
	protected readonly value: TValue;
	
	constructor (value: TValue)
	{
		this.value = value;
	}
	
	isNode (): this is NodeScopeItem
	{
		return this.type === ScopeItemType.NODE;
	}
	isSpread (): this is SpreadScopeItem
	{
		return this.type === ScopeItemType.SPREAD;
	}
	isTemplate (): this is TemplateScopeItem
	{
		return this.type === ScopeItemType.TEMPLATE;
	}
	
	getNode ()
	{
		if (!this.isNode())
			throw new Error();
		
		return <Argument | CommandList> (<any> this).value;
	}
	getSpread ()
	{
		if (!this.isSpread())
			throw new Error();
		
		return <(Argument | CommandList)[]> (<any> this).value;
	}
	getTemplate ()
	{
		if (!this.isTemplate())
			throw new Error();
		
		return <Template> (<any> this).value;
	}
}

class NodeScopeItem extends ScopeItem<ScopeItemType.NODE, Argument | CommandList>
{
	protected readonly type = ScopeItemType.NODE;
}

class SpreadScopeItem extends ScopeItem<ScopeItemType.SPREAD, (Argument | CommandList)[]>
{
	protected readonly type = ScopeItemType.SPREAD;
}

class TemplateScopeItem extends ScopeItem<ScopeItemType.TEMPLATE, Template>
{
	protected readonly type = ScopeItemType.TEMPLATE;
}

//
//
//

class Template
{
	readonly name: string;
	
	private params: string[];
	private body: CommandList;
	
	private declarationScope: Scope<ScopeItem<any, any>>;
	
	constructor (command: Command, declarationScope: Scope<ScopeItem<any, any>>)
	{
		this.declarationScope = declarationScope;
		
		this.name = command.argv(1).getArgument().getString();
		
		const args = [...command].slice(2);
		const [body, ...paramsReversed] = args.reverse(); // can only use spread on the last item
		
		const paramNames = paramsReversed
			.reverse()
			.map(n => n.getArgument().getString());
		
		if (body === undefined)
			throw CFGError.for(command, "Template body missing");
		
		this.params = paramNames;
		this.body = body.getCommandList();
		
		console.log("templates: created template %s with %s parameters", this.name, this.params.length);
	}
	
	/**
	 * creates a clone of the body for the command
	 */
	getReplacement (command: Command, useScope: Scope<ScopeItem<any, any>>)
	{
		const args = [...command].slice(1);
		
		const cloneScope = new Scope(this.declarationScope);
		
		const params = [...this.params];
		
		while (params.length)
		{
			const paramName = params.shift()!;
			
			console.assert(!!paramName);
			
			if (paramName.startsWith("..."))
			{
				console.log("found spread parameter: %s", paramName);
				
				const spreadName = paramName;
				
				const argsAfterThis = (args.length - 1);
				const paramsAfterThis = (params.length - 1);
				const leftToSpread = argsAfterThis - paramsAfterThis;
				
				console.log("spread %s will capture %s items",
					spreadName, leftToSpread);
				
				const spread = args.splice(0, leftToSpread);
				
				cloneScope.set(spreadName, new SpreadScopeItem(spread));
				
				continue;
			}
			
			const valueNode = args.shift()!;
			
			console.assert(valueNode);
			
			if (valueNode.isArgument() && !valueNode.isQuoted())
			{
				const argumentName = valueNode.getString();
				
				console.log("got a possible parameter argument for %s: %s", paramName, argumentName);
				
				// copy into scopes for the block BUT with the name of the parameter
				
				if (useScope.has(argumentName))
					cloneScope.set(paramName, useScope.get(argumentName));
				
				continue;
			}
			
			console.log("got a block or string parameter for %s", paramName);
			
			cloneScope.set(paramName, new NodeScopeItem(valueNode));
		}
		
		const duplicate = this.body.clone();
		interpretTemplatesInBlock(duplicate, cloneScope);
		return duplicate;
	}
}

/**
 * interprets all templates in a block
 * 
 * finds declarations, and repalces uses
 */
function interpretTemplatesInBlock
(
	block: CommandList,
	parentScope: Scope<ScopeItem<any, any>>,
)
{
	const scope = new Scope(parentScope);
	
	for (const command of [...block])
	{
		// template declaration
		if (command.nameEquals("template"))
		{
			const template = new Template(command, scope);
			scope.set(template.name, new TemplateScopeItem(template));
			console.log("templates: found a declaration for %s", template.name);
			block.removeChild(command);
			continue;
		}
		
		// use of a template
		if (scope.has(command.getName()))
		{
			const template = scope.get(command.getName()).getTemplate();
			const replacements = template.getReplacement(command, scope);
			console.log("templates: replaced a use of %s", template.name);
			block.replaceChild(command, ...replacements);
			continue;
		}
		
		// other command, replace arguments
		for (const arg of command)
		{
			if (arg.isCommandList())
			{
				console.log("templates: recursing into a block argument of %s", command.getName());
				interpretTemplatesInBlock(arg, scope);
			}
			else if (arg.isArgument() && !arg.isQuoted())
			{
				const s = arg.getString();
				if (!scope.has(s))
					continue;
				
				if (!scope.get(s).isSpread())
				{
					const node = scope.get(arg.getString()).getNode();
					if (!node.isArgument() && !node.isCommandList())
						throw new Error();
					command.replaceArgument(arg, node.clone());
				}
				else
				{
					const node = scope.get(arg.getString()).getSpread();
					command.replaceArgument(arg, ...node.map(n => n.clone()));
				}
				
				console.log("templates: replaced a param to %s with name %s", command.getName(), arg.getString());
			}
		}
	}
}

export function rewriteTemplates (commands: CommandList)
{
	interpretTemplatesInBlock(commands, new Scope);
}