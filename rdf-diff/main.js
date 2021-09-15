// @ts-check
import { createReadStream } from 'fs';
import { RdfXmlParser } from 'rdfxml-streaming-parser';
import { Quad, Literal } from 'rdf-data-factory';
import { markdownTable } from 'markdown-table';

/**
 * @param {string} filename
 * @returns {Promise<Quad[]>}
 */
function readRDF(filename) {
  return new Promise((resolve, reject) => {
    /** @type {Quad[]} */
    const quads = [];
    createReadStream(filename)
      .pipe(new RdfXmlParser())
      .on('data', (data) => quads.push(data))
      .on('error', (error) => reject(error))
      .on('end', () => resolve(quads));
  });
}

/**
 * @param {Quad[]} oldRDF
 * @param {Quad[]} newRDF
 * @returns {{ added: Quad[], deleted: Quad[] }}
 */
function diffRDF(oldRDF, newRDF) {
  oldRDF = [...oldRDF];
  newRDF = [...newRDF];

  for (let i = 0, l = oldRDF.length; i < l; i++) {
    const j = newRDF.findIndex((quad) => oldRDF[i].equals(quad));
    if (j !== -1) {
      oldRDF[i] = newRDF[j] = null;
    }
  }

  return {
    added: newRDF.filter(Boolean),
    deleted: oldRDF.filter(Boolean),
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function toPrefix(value) {
  const prefixes = [
    ['imas', 'https://sparql.crssnky.xyz/imasrdf/URIs/imas-schema.ttl#'],
    ['imasrdf', 'https://sparql.crssnky.xyz/imasrdf/RDFs/detail/'],
    ['schema', 'http://schema.org/'],
    ['rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'],
    ['rdfs', 'http://www.w3.org/2000/01/rdf-schema#'],
    ['xsd', 'http://www.w3.org/2001/XMLSchema#'],
    ['foaf', 'http://xmlns.com/foaf/0.1/'],
  ];

  for (const [prefix, uri] of prefixes) {
    if (value.startsWith(uri)) {
      const short = decodeURIComponent(value.replace(uri, prefix + ':'));
      return `[${short}](${value})`;
    }
  }

  return value;
}

/**
 * @param {Quad} quad
 * @param {string} mark
 * @returns {string[]}
 */
function createRow(quad, mark) {
  return [
    mark,
    toPrefix(quad.predicate.value),
    toPrefix(quad.object.value),
    quad.object instanceof Literal
      ? toPrefix(quad.object.datatype.value)
      : undefined,
    quad.object instanceof Literal
      ? quad.object.language
      : undefined,
  ];
}

/**
 * @param {Map} table
 * @param {any} key
 * @param {any[]} value
 */
function push(table, key, value) {
  if (table.has(key)) {
    table.get(key).push(value);
  } else {
    table.set(key, [value]);
  }
};

/**
 * @param {Quad[]} added
 * @param {Quad[]} deleted
 * @returns {Map<string, string[][]>}
 */
function createTables(added, deleted) {
  /** @type {Map<string, string[][]>} */
  const tables = new Map();

  for (const quad of added) {
    push(tables, quad.subject.value, createRow(quad, '+'));
  }

  for (const quad of deleted) {
    push(tables, quad.subject.value, createRow(quad, '-'));
  }

  return tables;
}

/**
 * @param {Map<string, string[][]>} tables
 */
function printTables(tables) {
  const header = ['', 'Property', 'Value', 'rdf:datatype', 'xml:lang'];

  tables.forEach((table, key) => {
    console.log('### ' + toPrefix(key));
    console.log();
    console.log(markdownTable([header, ...table]));
    console.log();
  });
}

async function main() {
  const oldFile = process.argv[2];
  const newFile = process.argv[3];

  const [oldRDF, newRDF] = await Promise.all([
    readRDF(oldFile),
    readRDF(newFile),
  ]);

  const { added, deleted } = diffRDF(oldRDF, newRDF);

  if (added.length === 0 && deleted.length === 0) {
    return;
  }

  const tables = createTables(added, deleted);

  printTables(tables);
}

main().catch((e) => {
  console.error(e.stack);
});
