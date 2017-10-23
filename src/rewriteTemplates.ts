import {CommandList, Command, Argument} from "./parsing/Node.js";
import {CFGError} from "./errors.js";

/*

template <name> [...parameters] <body>

feature roadmap:
- passing templates to templates (capture scope)
- spread args (at most one, doesn't have to be last)

*/

interface IScope <TItem>
{
	getItem (name: string): TItem;
	hasItem (name: string): boolean;
	addItem (name: string, value: TItem): void;
}

class NullScope implements IScope<any>
{
	getItem (): never
	{
		throw new Error();
	}
	
	hasItem ()
	{
		return false;
	}
	
	addItem ()
	{
		throw new Error();
	}
}

class ItemScope <TItem = any>
{
	protected items: Map<string, TItem>
	protected parent: IScope<TItem>;
	
	constructor (parent: IScope<TItem> = new NullScope())
	{
		this.items = new Map();
		this.parent = parent;
	}
	
	getItem (name: string): TItem
	{
		name = name.toLowerCase();
		
		if (this.hasOwnItem(name))
			return this.items.get(name)!;
		
		if (this.parent.hasItem(name))
			return this.parent.getItem(name);
		
		throw new Error();
	}
	
	addItem (name: string, value: TItem)
	{
		name = name.toLowerCase();
		
		if (this.hasOwnItem(name))
			console.warn("'%s' already exists in this scope", name);
		
		this.items.set(name, value);
	}
	
	hasOwnItem (name: string)
	{
		name = name.toLowerCase();
		
		return this.items.has(name);
	}
	
	hasItem (name: string)
	{
		name = name.toLowerCase();
		
		if (this.hasOwnItem(name))
			return true;
		
		return this.parent.hasItem(name);
	}
}

/** any cfg2 value */
type Param = Argument | CommandList;

/** scope of template parameters */
type ParamScope = IScope<Param>;

/** scope of template declarations */
type TemplateScope = IScope<Template>;

class Template
{
	readonly name: string;
	private params: string[];
	private body: CommandList;
	
	constructor (command: Command)
	{
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
	
	getParamScope (args: Param[], command: Command, parent: ParamScope)
	{
		if (args.length !== this.params.length)
			throw CFGError.for(command, "Arity mismatch");
		
		const scope = new ItemScope(parent);
		
		for (var i = 0; i < args.length; i++)
		{
			const name = this.params[i];
			const value = args[i];
			
			scope.addItem(name, value);
		}
		
		return scope;
	}
	
	/**
	 * creates a clone of the body for the command
	 */
	getReplacement (command: Command, templateScope: TemplateScope, parentParamScope: ParamScope)
	{
		const args = [...command].slice(1);
		
		const paramScope = this.getParamScope(args, command, parentParamScope);
		
		const duplicate = this.body.clone();
		
		interpretTemplatesInBlock(duplicate, templateScope, paramScope);
		
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
	parentTemplateScope: TemplateScope,
	parentParamScope: ParamScope,
)
{
	const templateScope = new ItemScope(parentTemplateScope);
	const paramScope = new ItemScope(parentParamScope);
	
	for (const command of [...block])
	{
		// template declaration
		if (command.nameEquals("template"))
		{
			const template = new Template(command);
			templateScope.addItem(template.name, template);
			console.log("templates: found a declaration for %s", template.name);
			block.removeChild(command);
			continue;
		}
		
		// use of a template
		if (templateScope.hasItem(command.getName()))
		{
			const template = templateScope.getItem(command.getName());
			const replacements = template.getReplacement(command, templateScope, paramScope);
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
				interpretTemplatesInBlock(arg, templateScope, paramScope);
			}
			else if (arg.isArgument() && !arg.isQuoted() && paramScope.hasItem(arg.getString()))
			{
				console.log("templates: replaced a param to %s with name %s", command.getName(), arg.getString());
				command.replaceArgument(arg, paramScope.getItem(arg.getString()).clone());
			}
		}
	}
}

export function rewriteTemplates (commands: CommandList)
{
	// rewriteTemplatesInBlock(commands);
	interpretTemplatesInBlock(commands, new NullScope, new NullScope);
}