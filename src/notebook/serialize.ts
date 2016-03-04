// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
'use strict';

import {
  ICellModel, IRawCellModel, IMarkdownCellModel, ICodeCellModel,
  isRawCellModel, isCodeCellModel, isMarkdownCellModel
} from '../cells';

import {
  INotebookContent, ICell, MAJOR_VERSION, MINOR_VERSION,
  IRawCell, ICodeCell, IMarkdownCell, isRawCell, isMarkdownCell,
  isCodeCell
} from './nbformat';

import {
  INotebookModel
} from './model';


/**
 * Serialize a notebook model.
 */
export 
function serialize(nb: INotebookModel): INotebookContent {
  let cells: ICell[] = [];
  for (let i = 0; i < nb.cells.length; i++) {
    let cell = nb.cells.get(i);
    cells.push(serializeCell(cell));
  }
  return {
    cells: cells,
    metadata: nb.metadata, 
    nbformat: MAJOR_VERSION, 
    nbformat_minor: MINOR_VERSION 
  };
}

/**
 * Deserialize notebook content into a model.
 */
export
function deserialize(data: INotebookContent, model: INotebookModel): void {
  model.cells.clear();

  // Iterate through the cell data, creating cell models.
  data.cells.forEach(c => {
    let cell: ICellModel;
    if (isMarkdownCell(c)) {
      cell = model.createMarkdownCell();
    } else if (isCodeCell(c)) {
      cell = model.createCodeCell();
    } else if (isRawCell(c)) {
      cell = model.createRawCell();
    }
    deserializeCell(c, cell);
    model.cells.add(cell);
  });
  
  if (model.cells.length) {
    model.selectedCellIndex = 0;
  }
  model.metadata = data.metadata;
}


/**
 * Serialize a cell model.
 */
function
serializeCell(cell: ICellModel): ICell {
  let output: ICell = {
    source: cell.input.textEditor.text,
    cell_type: cell.type,
    metadata: {
      tags: cell.tags,
      name: cell.name
    }
  }
  if (isRawCellModel(cell)) {
    (output as IRawCell).metadata.format = (cell as IRawCellModel).format;
  } else if (isCodeCellModel(cell)) {
    let out = output as ICodeCell;
    out.metadata.scrolled = cell.scrolled;
    out.metadata.collapsed = cell.collapsed;
    out.outputs = [];
    for (let i = 0; i < cell.output.outputs.length; i++) {
       out.outputs.push(cell.output.outputs.get(i));
    }
    out.execution_count = cell.executionCount;
  }
  return output;
}


/**
 * Deserialize cell data.
 */
function deserializeCell(data: ICell, model: ICellModel): void {
  let source = data.source as string;
  if (Array.isArray(data.source)) {
    source = (data.source as string[]).join('\n');
  }
  model.input.textEditor.text = source;
  model.tags = data.metadata.tags;
  model.name = data.metadata.name;

  if (isCodeCellModel(model)) {
    let value = data as ICodeCell;
    model.collapsed = value.metadata.collapsed;
    model.scrolled = value.metadata.scrolled;
    model.executionCount = value.execution_count;
    for (let i = 0; i < value.outputs.length; i++) {
      model.output.add(value.outputs[i]);
    }
  } else if (isRawCellModel(model)) {
    (model as IRawCellModel).format = (data as IRawCell).metadata.format;;
  }
} 
