import chalk from "chalk";
import { ChoiceCollection, Separator } from "inquirer";
import Path = require("path");
import PkgUp = require("pkg-up");
import { isNullOrUndefined } from "util";
import YeomanGenerator = require("yeoman-generator");
import { Question } from "yeoman-generator";
import { GeneratorSetting } from "./GeneratorSetting";
import { IComponentProvider } from "./IComponentProvider";
import { IFileMapping } from "./IFileMapping";
import { IGeneratorSettings } from "./IGeneratorSettings";

/**
 * Represents a yeoman-generator.
 */
export abstract class Generator<T extends IGeneratorSettings = IGeneratorSettings> extends YeomanGenerator
{
    /**
     * The root of the module of the generator.
     */
    private moduleRoot: string;

    /**
     * The settings of the generator.
     */
    private settings: T = {} as T;

    /**
     * Initializes a new instance of the `Generator` class.
     *
     * @param args
     * A set of arguments for the generator.
     *
     * @param options
     * A set of options for the generator.
     */
    public constructor(args: string | string[], options: {})
    {
        super(args, options);
        this.moduleRoot = Path.dirname(PkgUp.sync({ cwd: this.resolved }));
    }

    /**
     * Gets the name of the root of the template-folder.
     */
    protected get TemplateRoot()
    {
        return "";
    }

    /**
     * Gets the questions to ask before executing the generator.
     */
    protected get Questions(): Array<Question<T>>
    {
        return [];
    }

    /**
     * Gets the components provided by the generator.
     */
    protected get ProvidedComponents(): IComponentProvider<T>
    {
        return null;
    }

    /**
     * Gets the settings of the generator.
     */
    public get Settings()
    {
        return this.settings;
    }

    /**
     * Joins the arguments together and returns the resulting path relative to the module-directory.
     *
     * @param path
     * The path that is to be joined.
     */
    public modulePath(...path: string[])
    {
        return Path.join(this.moduleRoot || "", ...path);
    }

    /**
     * Joins the arguments together and returns the resulting path relative to the template-directory.
     *
     * @param path
     * The path that is to be joined.
     */
    public templatePath(...path: string[])
    {
        return this.modulePath("templates", this.TemplateRoot || "", ...path);
    }

    /**
     * Gathers all information for executing the generator and saves them to the `Settings`.
     */
    public async prompting()
    {
        let questions: Array<Question<T>> = [];
        let components: ChoiceCollection<T> = [];
        let defaults: string[] = [];

        if (this.ProvidedComponents !== null)
        {
            for (let category of this.ProvidedComponents.Categories)
            {
                components.push(new Separator(category.DisplayName));

                for (let component of category.Components)
                {
                    let isDefault = !isNullOrUndefined(component.Default) && component.Default;

                    components.push({
                        value: component.ID,
                        name: component.DisplayName,
                        checked: isDefault
                    });

                    if (isDefault)
                    {
                        defaults.push(component.ID);
                    }

                    if (!isNullOrUndefined(component.Questions))
                    {
                        for (let i = 0; i < component.Questions.length; i++)
                        {
                            let question = component.Questions[i];
                            let when = question.when;

                            question.when = async (settings: T) =>
                            {
                                if (settings[GeneratorSetting.Components].includes(component.ID))
                                {
                                    if (i === 0)
                                    {
                                        this.log();
                                        this.log(`${chalk.red(">>")} ${chalk.bold(component.DisplayName)} ${chalk.red("<<")}`);
                                    }

                                    if (!isNullOrUndefined(when))
                                    {
                                        if (typeof when === "function")
                                        {
                                            return when(settings);
                                        }
                                        else
                                        {
                                            return when;
                                        }
                                    }
                                    else
                                    {
                                        return true;
                                    }
                                }
                                else
                                {
                                    return false;
                                }
                            };

                            questions.push(question);
                        }
                    }
                }
            }

            questions.unshift(
                {
                    type: "checkbox",
                    name: GeneratorSetting.Components,
                    message: this.ProvidedComponents.Question,
                    choices: components,
                    default: defaults
                });
        }

        questions.unshift(...this.Questions);
        Object.assign(this.Settings, await this.prompt(questions));
        this.log();
    }

    /**
     * Writes all files for the components.
     */
    public async writing()
    {
        for (let category of this.ProvidedComponents.Categories)
        {
            for (let component of category.Components)
            {
                if (this.Settings[GeneratorSetting.Components].includes(component.ID))
                {
                    let fileMappings = await this.ResolveValue(component.FileMappings, this.Settings);

                    for (let fileMapping of fileMappings)
                    {
                        await this.ProcessFile(fileMapping);
                    }
                }
            }
        }
    }

    /**
     * Installs all required dependencies.
     */
    public async install()
    {
    }

    /**
     * Finalizes the generation-process.
     */
    public async end()
    {
    }

    /**
     * Resolves a value no matter whether it is wrapped in a function or not.
     *
     * @param settings
     * The settings to use for resolving the value.
     *
     * @param value
     * The value to resolve.
     */
    protected async ResolveValue<TSource extends any[], TValue>(value: (TValue | ((...settings: TSource) => TValue) | ((...settings: TSource) => Promise<TValue>)), ...source: TSource)
    {
        if (value instanceof Function)
        {
            let result = value(...source);

            if (result instanceof Promise)
            {
                return result;
            }
            else
            {
                return result;
            }
        }
        else
        {
            return value;
        }
    }

    /**
     * Processes a file-mapping.
     *
     * @param fileMapping
     * The file-mapping to process.
     */
    protected async ProcessFile(fileMapping: IFileMapping<T>)
    {
        let sourcePath: string = await this.ResolveValue(fileMapping.Source, this.Settings);
        let destinationPath = await this.ResolveValue(fileMapping.Destination, this.Settings);

        sourcePath = (isNullOrUndefined(sourcePath) || Path.isAbsolute(sourcePath)) ? sourcePath : this.templatePath(sourcePath);
        destinationPath = (isNullOrUndefined(destinationPath) || Path.isAbsolute(destinationPath)) ? destinationPath : this.destinationPath(destinationPath);

        let context = await this.ResolveValue(fileMapping.Context, this.Settings, sourcePath, destinationPath);
        let defaultProcessor = (sourcePath: string, destinationPath: string, context: any) =>
        {
            if (
                !isNullOrUndefined(sourcePath) &&
                !isNullOrUndefined(destinationPath))
            {
                if (isNullOrUndefined(context))
                {
                    this.fs.copy(sourcePath, destinationPath);
                }
                else
                {
                    this.fs.copyTpl(sourcePath, destinationPath, context);
                }
            }
        };

        if (isNullOrUndefined(fileMapping.Process))
        {
            defaultProcessor(sourcePath, destinationPath, context);
        }
        else
        {
            let result = fileMapping.Process(sourcePath, destinationPath, context, defaultProcessor, this.Settings);

            if (result instanceof Promise)
            {
                await result;
            }
        }
    }
}