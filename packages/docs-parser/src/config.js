/* eslint-disable guard-for-in */
import fs from 'fs-extra-promisify'
import to, { is } from 'to-js'
import path from 'path'
import clor from 'clor'
import logger from 'docs-helpers-logger'

// changed by `options` key
export const default_options = {
  config: `${process.cwd()}/.docsfile.js`,

  // files to parse for documentation
  files: [ 'app/**/*', 'src/**/*', '*.md' ],

  // files to be ignored
  ignore: [
    '.*', // all dot files
    'node_modules/', 'bower_components/', 'jspm_packages/', // package managers
    'dist/', 'build/', 'docs/', // normal folders
    'tests/', 'coverage/' // unit tests and coverage results
  ],

  // when true it will watch files for changes
  watch: false,

  dest: `${process.cwd()}/docs/docs.json`,

  page_fallback: 'general', // used if `@page` isn't defined

  // add gitignore files to the ignore list. Depending on ignored files it
  // could cause things to ge parsed slower, that's why it's defaulted to `false`
  gitignore: false,

  // this stops the current block from adding lines if there're `n`
  // blank line lines between code, and starts a new block.
  blank_lines: 4,
  debug: false,
  warning: false,
  timestamps: false,

  // stop adding code to the token.code.contents if the indent is less than the starting line indent
  indent: true,

  // this will return the raw data by file, aka data won't be sorted
  raw: false,

  sort: [],

  languages: {
    default: {
      // annotation identifier that can be change on a file specific basis if needed.
      // While this is a setting, it probably should probably never be changed. If it does
      // need to be changed it should be changed to be a special character.
      prefix: '@',

      // header comment style
      // @note {10} only 1 of these can be used per file
      header: { start: '////', line: '///', end: '////', type: 'header' },

      // body comment style
      body: { start: '', line: '///', end: '', type: 'body' },

      // inline comments for body comments
      inline: { start: '', line: '///#', end: '', type: 'inline' },

      // this is used for any interpolations that might occur in annotations.
      // I don't see this needing to change but just incase I'm making it a setting.
      // @note {10} This setting is used to create a RegExp so certain characters need to be escaped
      interpolation: {
        start: '\\${',
        end: '}'
      },
    },
    css: {
      header: { start: '/***', line: '*', end: '***/' },
      body: { start: '/**', line: '*', end: '**/' },
      inline: { start: '/**#', line: '', end: '**/' }
    },
    'rb, py, coffee, sh, bash, pl': {
      header: { start: '###', line: '##', end: '###' },
      body: { line: '##' },
      inline: { line: '##$' }
    },
    'html, md, markdown, mark, mdown, mkdn, mdml, mkd, mdwn, mdtxt, mdtext, text': {
      header: { start: '<!----', line: '', end: '---->' },
      body: { start: '<!---', line: '', end: '--->' },
      inline: { start: '<!---#', line: '', end: '--->' }
    },
    jade: {
      header: { start: '//-//', line: '//-/', end: '//-//' },
      body: { line: '//-/' },
      inline: { line: '//-#' }
    },
    cfm: {
      header: { start: '<!-----', line: '', end: '----->' },
      body: { start: '<!----', line: '', end: '---->' },
      inline: { start: '<!----#', line: '', end: '---->' }
    }
  },

  annotations: {},
}

export default async function config(options = {}) {
  let config_file = (options.config ? options : default_options).config

  // try to get the `docsfile.js` so the user config can be merged
  try {
    // merge the default options with the user options
    config_file = require(config_file)
  } catch (err) {
    config_file = {}
  }

  // merge the config file with passed options
  options = to.extend(config_file, options)
  // Not sure this valid config should be a thing because what if a user
  // want's to pass in options here for their annotations.
  // Should It be a option that determins if this runs? like `strict_config`
  // options = to.extend(ensureValidConfig(config_file), options)

  // ensures `files`, `ignore` is always an array this way no
  // more checks have to happen for it
  if (options.files) options.files = to.array(options.files)
  if (options.ignore) options.ignore = to.array(options.ignore)


  // merge options with default_options so there's a complete list of settings
  options = to.extend(to.clone(default_options), options)
  const root = process.cwd()
  if (options.gitignore) {
    try {
      options.ignore = to.flatten([
        options.ignore,
        to.array(to.string(await fs.readFile(path.join(root, '.gitignore'))))
      ])
    } catch (err) {
      // do nothing because there's no `.gitignore`
    }
  }

  // always ignore json files because they don't support comments
  options.ignore.push('**/*.json')

  // ensures blank_lines is a number to avoid errors
  options.blank_lines = to.number(options.blank_lines)

  options.languages = parseLanguages(options.languages)

  {
    const { inline } = options.annotations
    if (inline) {
      logger.emit('error', `you can't have an ${clor.bold.red('@inline')} annotation because it's reserved`)
    }
  }

  logger.options.debug = options.debug
  logger.options.warning = options.warning
  logger.options.timestamps = options.timestamps

  return options
}


export function parseLanguages(languages) {
  let parsed = {}

  // ensures comments are a normal structure (aka not `'rb, py': {...}`)
  for (let [ option, value ] of to.entries(languages)) {
    // converts option into an array so multiple languages can be declared at the same time
    option = option.replace(/\s/g, '').split(',')

    for (let lang in option) parsed[option[lang]] = value
  }

  // ensures each comment has all the required comment settings
  // this makes it easier later on when parsing
  for (let [ lang, value ] of to.entries(parsed)) {
    if (lang !== '_') {
      parsed[lang] = to.extend(to.clone(default_options.languages.default), value)
    }
  }

  // extend any languages that have the extend option
  for (let [ lang, value ] of to.entries(parsed)) {
    if (
      lang !== '_' &&
      value.extend
    ) {
      if (!parsed[value.extend]) {
        throw new Error(`${value.extend} comment style doesn't exist`)
      } else if (!is.string(value.extend)) {
        throw new Error(`the value of extend must be a string you passed ${value.extend}`)
      } else {
        parsed[lang] = to.extend(value, to.clone(parsed[value.extend]))
      }
    }
    delete parsed[lang].extend
  }

  return parsed
}
