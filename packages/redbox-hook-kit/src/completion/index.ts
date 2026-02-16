type CompletionSpec = {
  globalOptions: string[];
  topLevelCommands: string[];
  generateCommands: string[];
  commandOptions: Record<string, string[]>;
  fileValueOptions: string[];
};

function getCompletionSpec(): CompletionSpec {
  const globalOptions = ['--root', '--core-types-root', '--angular-root', '--dry-run', '-h', '--help', '-V', '--version'];
  const topLevelCommands = ['init', 'generate', 'g', 'install-skills', 'skills', 'migrate-form-config', 'completion', 'help'];
  const generateCommands = ['controller', 'service', 'method', 'angular-app', 'angular-service', 'form-component', 'form-field', 'model'];

  const commandOptions: Record<string, string[]> = {
    'migrate-form-config': ['-i', '--input', '-o', '--output'],
    'completion': [],
    'init': [],
    'install-skills': [],
    'skills': [],
    'generate controller': ['--actions', '--webservice', '--class-name', '--route', '--routes', '--nav', '--lang', '--auth'],
    'generate service': ['--methods'],
    'generate method': ['--file', '--method', '--route', '--http', '--auth', '--nav', '--lang'],
    'generate angular-app': ['--ejs-view', '--auth'],
    'generate angular-service': ['--app', '--methods'],
    'generate form-component': ['--app', '--with-service'],
    'generate form-field': ['--type'],
    'generate model': ['--identity', '--attrs', '--belongs-to', '--has-many']
  };

  const fileValueOptions = ['--root', '--core-types-root', '--angular-root', '--input', '--output', '--file'];
  return { globalOptions, topLevelCommands, generateCommands, commandOptions, fileValueOptions };
}

function generateBashCompletion(): string {
  const spec = getCompletionSpec();
  const top = spec.topLevelCommands.join(' ');
  const generateSubs = spec.generateCommands.join(' ');
  const globalOpts = spec.globalOptions.join(' ');
  const fileOpts = spec.fileValueOptions.join(' ');
  const commandOptionEntries = Object.entries(spec.commandOptions)
    .map(([key, value]) => `"${key}") opts="${value.join(' ')}";;`)
    .join('\n      ');

  return `# bash completion for redbox-hook-kit
_redbox_hook_kit_completion() {
  local cur prev words cword
  _init_completion || return

  local top_commands="${top}"
  local generate_subcommands="${generateSubs}"
  local global_opts="${globalOpts}"
  local file_value_opts="${fileOpts}"

  case "$prev" in
    $file_value_opts)
      COMPREPLY=($(compgen -f -- "$cur"))
      return
      ;;
  esac

  if [[ $cword -le 1 ]]; then
    COMPREPLY=($(compgen -W "$top_commands $global_opts" -- "$cur"))
    return
  fi

  if [[ "\${words[1]}" == "generate" || "\${words[1]}" == "g" ]]; then
    if [[ $cword -eq 2 ]]; then
      COMPREPLY=($(compgen -W "$generate_subcommands" -- "$cur"))
      return
    fi
    local key="generate \${words[2]}"
    local opts=""
    case "$key" in
      ${commandOptionEntries}
      *) opts="";;
    esac
    COMPREPLY=($(compgen -W "$opts $global_opts" -- "$cur"))
    return
  fi

  local opts=""
  case "\${words[1]}" in
    "migrate-form-config") opts="-i --input -o --output" ;;
    "completion") opts="" ;;
    "init") opts="" ;;
    "install-skills") opts="" ;;
    "skills") opts="" ;;
    *) opts="" ;;
  esac

  COMPREPLY=($(compgen -W "$opts $global_opts" -- "$cur"))
}

complete -F _redbox_hook_kit_completion redbox-hook-kit
`;
}

function generateZshCompletion(): string {
  const bashScript = generateBashCompletion();
  return `#compdef redbox-hook-kit
autoload -U +X bashcompinit && bashcompinit
${bashScript}`;
}

function generateFishCompletion(): string {
  const spec = getCompletionSpec();
  const lines: string[] = [
    '# fish completion for redbox-hook-kit',
    'set -l __rbhk_cmd redbox-hook-kit',
    'complete -c $__rbhk_cmd -f'
  ];

  for (const cmd of spec.topLevelCommands) {
    lines.push(`complete -c $__rbhk_cmd -n "__fish_use_subcommand" -a "${cmd}"`);
  }
  for (const option of spec.globalOptions) {
    if (option.startsWith('--')) {
      const name = option.replace(/^--/, '');
      const requiresValue = ['root', 'core-types-root', 'angular-root'].includes(name);
      lines.push(`complete -c $__rbhk_cmd -l ${name}${requiresValue ? ' -r' : ''}`);
    }
  }
  for (const sub of spec.generateCommands) {
    lines.push(`complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate g; and __fish_use_subcommand" -a "${sub}"`);
  }

  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from migrate-form-config" -s i -l input -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from migrate-form-config" -s o -l output -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from completion" -a "bash zsh fish powershell pwsh"');

  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from controller" -l actions -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from controller" -l webservice');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from controller" -l class-name -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from controller" -l route -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from controller" -l routes -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from controller" -l nav -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from controller" -l lang -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from controller" -l auth -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from service" -l methods -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from method" -l file -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from method" -l method -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from method" -l route -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from method" -l http -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from method" -l auth -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from method" -l nav -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from method" -l lang -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from angular-app" -l ejs-view -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from angular-app" -l auth -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from angular-service" -l app -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from angular-service" -l methods -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from form-component" -l app -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from form-component" -l with-service');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from form-field" -l type -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from model" -l identity -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from model" -l attrs -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from model" -l belongs-to -r');
  lines.push('complete -c $__rbhk_cmd -n "__fish_seen_subcommand_from generate; and __fish_seen_subcommand_from model" -l has-many -r');

  return `${lines.join('\n')}\n`;
}

function generatePowerShellCompletion(): string {
  return `# PowerShell completion for redbox-hook-kit
Register-ArgumentCompleter -Native -CommandName redbox-hook-kit -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $tokens = $commandAst.CommandElements | ForEach-Object { $_.Extent.Text }
  $global = @('--root','--core-types-root','--angular-root','--dry-run','-h','--help','-V','--version')
  $top = @('init','generate','g','install-skills','skills','migrate-form-config','completion','help')
  $generateSub = @('controller','service','method','angular-app','angular-service','form-field','model')

  if ($tokens.Count -le 2) {
    @($top + $global) | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
    return
  }

  if ($tokens[1] -eq 'generate' -or $tokens[1] -eq 'g') {
    if ($tokens.Count -le 3) {
      $generateSub | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
      }
      return
    }
    $sub = $tokens[2]
    $opts = switch ($sub) {
      'controller' { @('--actions','--webservice','--class-name','--route','--routes','--nav','--lang','--auth') }
      'service' { @('--methods') }
      'method' { @('--file','--method','--route','--http','--auth','--nav','--lang') }
      'angular-app' { @('--ejs-view','--auth') }
      'angular-service' { @('--app','--methods') }
      'form-component' { @('--app','--with-service') }
      'form-field' { @('--type') }
      'model' { @('--identity','--attrs','--belongs-to','--has-many') }
      default { @() }
    }
    @($opts + $global) | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)
    }
    return
  }

  $opts = switch ($tokens[1]) {
    'migrate-form-config' { @('-i','--input','-o','--output') }
    'completion' { @('bash','zsh','fish','powershell','pwsh') }
    default { @() }
  }

  @($opts + $global) | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)
  }
}
`;
}

export function generateCompletionScript(shell: string): string {
  switch (shell) {
    case 'bash':
      return generateBashCompletion();
    case 'zsh':
      return generateZshCompletion();
    case 'fish':
      return generateFishCompletion();
    case 'powershell':
    case 'pwsh':
      return generatePowerShellCompletion();
    default:
      throw new Error(`Unsupported shell '${shell}'. Expected one of: bash, zsh, fish, powershell`);
  }
}
