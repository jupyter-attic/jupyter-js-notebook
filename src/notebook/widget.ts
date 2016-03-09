// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
'use strict';

import {
  KernelStatus
} from 'jupyter-js-services';

import {
  showDialog
} from 'jupyter-js-ui/lib/dialog';

import {
  DisposableDelegate, IDisposable
} from 'phosphor-disposable';

import {
  Message
} from 'phosphor-messaging';

import {
  IChangedArgs
} from 'phosphor-properties';

import {
  IObservableList, ObservableList, IListChangedArgs, ListChangeType
} from 'phosphor-observablelist';

import {
  Widget
} from 'phosphor-widget';

import {
  PanelLayout
} from 'phosphor-panel';

import {
  NotebookModel, INotebookModel
} from './model';

import {
  ICellModel,
  CodeCellWidget, MarkdownCellWidget,
  CodeCellModel, MarkdownCellModel, isMarkdownCellModel,
  RawCellModel, RawCellWidget
} from '../cells';

import './codemirror-ipython';
import './codemirror-ipythongfm';


/**
 * The class name added to notebook widgets.
 */
const NB_CLASS = 'jp-Notebook';

/**
 * The class name added to notebook container widget.
 */
const NB_CONTAINER = 'jp-Notebook-Container';

/**
 * The class name added to notebook cell widget.
 */
const NB_CELLS = 'jp-Notebook-Cells';

/**
 * The class name added to notebook widget cells.
 */
const NB_CELL_CLASS = 'jp-Notebook-cell';

/**
 * The class name added to the notebook toolbar.
 */
const NB_TOOLBAR = 'jp-NBToolbar';

/**
 * The class name added to notebook toolbar items.
 */
const TOOLBAR_ITEM = 'jp-NBToolbar-item';

/**
 * The class name added to notebook toolbar buttons.
 */
const TOOLBAR_BUTTON = 'jp-NBToolbar-button';

/**
 * The class name added to toolbar save button.
 */
const TOOLBAR_SAVE = 'jp-NBToolbar-save';

/**
 * The class name added to toolbar insert button.
 */
const TOOLBAR_INSERT = 'jp-NBToolbar-insert';

/**
 * The class name added to toolbar cut button.
 */
const TOOLBAR_CUT = 'jp-NBToolbar-cut';

/**
 * The class name added to toolbar copy button.
 */
const TOOLBAR_COPY = 'jp-NBToolbar-copy';

/**
 * The class name added to toolbar paste button.
 */
const TOOLBAR_PASTE = 'jp-NBToolbar-paste';

/**
 * The class name added to toolbar run button.
 */
const TOOLBAR_RUN = 'jp-NBToolbar-run';

/**
 * The class name added to toolbar interrupt button.
 */
const TOOLBAR_INTERRUPT = 'jp-NBToolbar-interrupt';

/**
 * The class name added to toolbar restart button.
 */
const TOOLBAR_RESTART = 'jp-NBToolbar-restart';

/**
 * The class name added to toolbar cell type dropdown.
 */
const TOOLBAR_CELL = 'jp-NBToolbar-cellType';

/**
 * The class name added to toolbar kernel name text.
 */
const TOOLBAR_KERNEL = 'jp-NBToolbar-kernelName';

/**
 * The class name added to toolbar kernel indicator icon.
 */
const TOOLBAR_INDICATOR = 'jp-NBToolbar-kernelIndicator';

/**
 * The class name added to a pressed button.
 */
const TOOLBAR_PRESSED = 'jp-mod-pressed';

/**
 * The class name added to a busy kernel indicator.
 */
const TOOLBAR_BUSY = 'jp-mod-busy';


/**
 * A widget for a notebook.
 */
export
class NotebookWidget extends Widget {
  /**
   * Create a new cell widget given a cell model.
   */
  static createCell(cell: ICellModel): Widget {
    let widget: Widget;
    switch(cell.type) {
    case 'code':
      widget = new CodeCellWidget(cell as CodeCellModel);
      break;
    case 'markdown':
      widget = new MarkdownCellWidget(cell as MarkdownCellModel);
      break;
    case 'raw':
      widget = new RawCellWidget(cell as RawCellModel);
      break;
    default:
      // If there are any issues, just return a blank placeholder
      // widget so the lists stay in sync.
      widget = new Widget();
    }
    widget.addClass(NB_CELL_CLASS);
    return widget;
  }

  /**
   * Create a new toolbar for the notebook.
   */
  static createToolbar(model: INotebookModel): NotebookToolbar {
    return new NotebookToolbar(model);
  }

  /**
   * Construct a notebook widget.
   */
  constructor(model: INotebookModel) {
    super();
    this.addClass(NB_CLASS);
    this._model = model;
    let constructor = this.constructor as typeof NotebookWidget;

    this.layout = new PanelLayout();
    let layout = this.layout as PanelLayout;
    this._toolbar = constructor.createToolbar(model);
    layout.addChild(this._toolbar);

    let container = new Widget();
    container.addClass(NB_CONTAINER);
    container.layout = new PanelLayout();
    this._notebook = new NotebookCells(model);
    (container.layout as PanelLayout).addChild(this._notebook);
    layout.addChild(container);

    let cellsLayout = this._notebook.layout as PanelLayout;
    let factory = constructor.createCell;
    for (let i = 0; i < model.cells.length; i++) {
      cellsLayout.addChild(factory(model.cells.get(i)));
    }
    model.cells.changed.connect(this.onCellsChanged, this);
  }

  /**
   * Get the model for the widget.
   *
   * #### Notes
   * This is a read-only property.
   */
  get model(): INotebookModel {
    return this._model;
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose() {
    this._model.cells.changed.disconnect(this.onCellsChanged);
    this._model = null;
    super.dispose();
  }

  /**
   * Insert a new code cell above the current cell.
   */
  insertAbove(): void {
    this._toolbar.insertAbove();
  }

  /**
   * Insert a new code cell below the current cell.
   */
  insertBelow(): void {
    this._toolbar.insertBelow();
  }

  /**
   * Copy the current cell(s) to the clipboard.
   */
  copy(): void {
    this._toolbar.copy();
  }

  /**
   * Cut the current cell(s).
   */
  cut(): void {
    this._toolbar.cut();
  }

  /**
   * Paste cell(s) from the clipboard.
   */
  paste(): void {
    this._toolbar.paste();
  }


  /**
   * Change the current cell type(s).
   */
  changeCellType(value: string): void {
    this._toolbar.changeCellType(value);
  }

  /**
   * Run the selected cell(s).
   */
  run(): void {
    this._toolbar.run();
  }

  /**
   * Interrupt the kernel.
   */
  interrupt(): Promise<void> {
    return this._toolbar.interrupt();
  }

  /**
   * Restart the kernel.
   */
  restart(): Promise<void> {
    return this._toolbar.restart();
  }

  /**
   * Handle a change cells event.
   */
  protected onCellsChanged(sender: IObservableList<ICellModel>, args: IListChangedArgs<ICellModel>) {
    let layout = this._notebook.layout as PanelLayout;
    let constructor = this.constructor as typeof NotebookWidget;
    let factory = constructor.createCell;
    let widget: Widget;
    switch(args.type) {
    case ListChangeType.Add:
      layout.insertChild(args.newIndex, factory(args.newValue as ICellModel));
      break;
    case ListChangeType.Move:
      layout.insertChild(args.newIndex, layout.childAt(args.oldIndex));
      break;
    case ListChangeType.Remove:
      widget = layout.childAt(args.oldIndex);
      layout.removeChild(widget);
      widget.dispose();
      break;
    case ListChangeType.Replace:
      for (let i = (args.oldValue as ICellModel[]).length; i > 0; i--) {
        widget = layout.childAt(i);
        layout.removeChild(widget);
        widget.dispose();
      }
      let newValues = args.newValue as ICellModel[];
      for (let i = 0; i < newValues.length; i++) {
        layout.addChild(factory(newValues[i]));
      }
      break;
    case ListChangeType.Set:
      widget = layout.childAt(args.newIndex);
      layout.removeChild(widget);
      widget.dispose();
      layout.insertChild(args.newIndex, factory(args.newValue as ICellModel));
      break;
    }
  }

  private _model: INotebookModel = null;
  private _toolbar: NotebookToolbar = null;
  private _notebook: NotebookCells = null;
}


/**
 * A widget holding the notebook cells.
 */
class NotebookCells extends Widget {
  /**
   * Construct a notebook cells widget.
   */
  constructor(model: INotebookModel) {
    super();
    this.addClass(NB_CELLS);
    this._model = model;
    this.layout = new PanelLayout();
  }

  /**
   * Get the model for the widget.
   *
   * #### Notes
   * This is a read-only property.
   */
  get model(): INotebookModel {
    return this._model;
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose() {
    this._model = null;
    super.dispose();
  }

  /**
   * Handle the DOM events for the widget.
   *
   * @param event - The DOM event sent to the widget.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the dock panel's node. It should
   * not be called directly by user code.
   */
  handleEvent(event: Event): void {
    switch (event.type) {
    case 'click':
      this._evtClick(event as MouseEvent);
      break;
    case 'dblclick':
      this._evtDblClick(event as MouseEvent);
      break;
    }
  }

  /**
   * Handle `after_attach` messages for the widget.
   */
  protected onAfterAttach(msg: Message): void {
    this.node.addEventListener('click', this);
    this.node.addEventListener('dblclick', this);
  }

  /**
   * Handle `before_detach` messages for the widget.
   */
  protected onBeforeDetach(msg: Message): void {
    this.node.removeEventListener('click', this);
    this.node.removeEventListener('dblclick', this);
  }

  /**
   * Find the cell index containing the target html element.
   *
   * #### Notes
   * Returns -1 if the cell is not found.
   */
  protected findCell(node: HTMLElement): number {
    // Trace up the DOM hierarchy to find the root cell node.
    // Then find the corresponding child and select it.
    let layout = this.layout as PanelLayout;
    while (node && node !== this.node) {
      if (node.classList.contains(NB_CELL_CLASS)) {
        for (let i = 0; i < layout.childCount(); i++) {
          if (layout.childAt(i).node === node) {
            return i;
          }
        }
        break;
      }
      node = node.parentElement;
    }
    return -1;
  }

  /**
   * Handle `click` events for the widget.
   */
  private _evtClick(event: MouseEvent): void {
    let model = this.model;
    if (!model.readOnly) {
      let i = this.findCell(event.target as HTMLElement);
      if (i === -1) {
        return;
      }
      model.activeCellIndex = i;
    }
  }

  /**
   * Handle `dblclick` events for the widget.
   */
  private _evtDblClick(event: MouseEvent): void {
    let model = this._model;
    if (model.readOnly) {
      return;
    }
    let i = this.findCell(event.target as HTMLElement);
    if (i === -1) {
      return;
    }
    let cell = model.cells.get(i);
    if (isMarkdownCellModel(cell) && cell.rendered) {
      cell.rendered = false;
      cell.mode = 'edit';
    }
  }

  private _model: INotebookModel = null;
}


function createElements(tag: string, attr?: any, children?: HTMLElement[] | string): HTMLElement {
  let el = document.createElement(tag);
  if (attr !== void 0 && attr !== null) {
    for (let x of Object.keys(attr)) {
      (el as any)[x] = attr[x];
    }
  }
  if (typeof children === 'string') {
     el.textContent = children;
  } else if (Array.isArray(children)) {
    for (let c of children) {
      el.appendChild(c);
    }
  }
  return el;
}

let ce = createElements;

/**
 * A class which provides a notebook toolbar widget.
 */
export
class NotebookToolbar extends Widget {
  /**
   * Create a new node for the widget.
   */
  static createNode(): HTMLElement {
    return  ce('div', void 0, [
      ce('span', {className: `${TOOLBAR_SAVE} ${TOOLBAR_ITEM} ${TOOLBAR_BUTTON}`}),
      ce('span', {className: `${TOOLBAR_INSERT} ${TOOLBAR_ITEM} ${TOOLBAR_BUTTON}`}),
      ce('span', {className: `${TOOLBAR_CUT} ${TOOLBAR_ITEM} ${TOOLBAR_BUTTON}`}),
      ce('span', {className: `${TOOLBAR_COPY} ${TOOLBAR_ITEM} ${TOOLBAR_BUTTON}`}),
      ce('span', {className: `${TOOLBAR_PASTE} ${TOOLBAR_ITEM} ${TOOLBAR_BUTTON}`}),
      ce('span', {className: `${TOOLBAR_RUN} ${TOOLBAR_ITEM} ${TOOLBAR_BUTTON}`}),
      ce('span', {className: `${TOOLBAR_INTERRUPT} ${TOOLBAR_ITEM} ${TOOLBAR_BUTTON}`}),
      ce('span', {className: `${TOOLBAR_RESTART} ${TOOLBAR_ITEM} ${TOOLBAR_BUTTON}`}),
      ce('select', {className: `${TOOLBAR_CELL} ${TOOLBAR_ITEM}`}, [
        ce('option', {value: 'code'}, 'Code'),
        ce('option', {value: 'markdown'}, 'Markdown'),
        ce('option', {value: 'raw'}, 'Raw')
      ]),
      ce('span', {className: `${TOOLBAR_KERNEL} ${TOOLBAR_ITEM}`}),
      ce('span', {className: `${TOOLBAR_INDICATOR} ${TOOLBAR_ITEM}`}),
    ]);
  }

  /**
   * Construct a new toolbar widget.
   */
  constructor(model: INotebookModel) {
    super();
    this.addClass(NB_TOOLBAR);
    this._model = model;
    this.kernelNameNode.textContent = model.metadata.kernelspec.display_name;
    if (model.cells.length) {
      let cell = model.cells.get(model.activeCellIndex);
      this.cellTypeNode.value = cell.type;
    }
    this.cellTypeNode.addEventListener('change', event => {
      this.changeCellType(this.cellTypeNode.value);
    });
    if (model.session) {
      this.handleSession();
    } else {
      this.kernelIndicatorNode.classList.add(TOOLBAR_BUSY);
    }
    model.stateChanged.connect(this.onModelChanged, this);
  }

  /**
   * Get the model used by the widget.
   *
   * #### Notes
   * This is a read-only property.
   */
  get model(): INotebookModel {
    return this._model;
  }

  /**
   * Get the kernel name node.
   */
  get kernelNameNode(): HTMLElement {
    let node = this.node.getElementsByClassName(TOOLBAR_KERNEL)[0];
    return node as HTMLElement;
  }

  /**
   * Get the cell selector node.
   */
  get cellTypeNode(): HTMLSelectElement {
    let node = this.node.getElementsByClassName(TOOLBAR_CELL)[0];
    return node as HTMLSelectElement;
  }

  /**
   * Get the kernel status indicator node.
   */
  get kernelIndicatorNode(): HTMLElement {
    let node = this.node.getElementsByClassName(TOOLBAR_INDICATOR)[0];
    return node as HTMLElement;
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose() {
    this._model = null;
    super.dispose();
  }

  /**
   * Insert a new code cell above the current cell.
   */
  insertAbove(): void {
    let cell = this.model.createCodeCell();
    this.model.cells.insert(this.model.activeCellIndex, cell);
  }

  /**
   * Insert a node code cell below the current cell.
   */
  insertBelow(): void {
    let cell = this.model.createCodeCell();
    this.model.cells.insert(this.model.activeCellIndex + 1, cell);
  }

  /**
   * Copy the current cell(s) to the clipboard.
   */
  copy(): void {
    this._copied = [];
    this._cut = [];
    let model = this.model;
    for (let i = 0; i < model.cells.length; i++) {
      let cell = model.cells.get(i);
      if (cell.selected || cell.active) {
        this._copied.push(i);
      }
    }
  }

  /**
   * Cut the current cell(s).
   */
  cut(): void {
    this._copied = [];
    this._cut = [];
    let model = this.model;
    for (let i = 0; i < model.cells.length; i++) {
      let cell = model.cells.get(i);
      if (cell.selected || cell.active) {
        model.cells.remove(cell);
        this._cut.push(cell);
      }
    }
  }

  /**
   * Paste cell(s) from the clipboard.
   */
  paste(): void {
    let model = this.model;
    let cut = this._cut;
    let copied = this._copied;
    let index = model.activeCellIndex + 1;
    if (copied.length > 0) {
      let existing: ICellModel[] = [];
      for (let index of copied) {
        existing.push(model.cells.get(index));
      }
      // Insert the copied cell(s).
      for (let cell of existing) {
        let newCell: ICellModel;
        switch(cell.type) {
        case 'code':
          newCell = model.createCodeCell(cell);
          break;
        case 'markdown':
          newCell = model.createMarkdownCell(cell);
          break;
        default:
          newCell = model.createRawCell(cell);
          break;
        }
        model.cells.insert(index, newCell);
      }
    } else {
      // Insert the curt cell(s).
      for (let cell of cut) {
        model.cells.insert(index, cell);
      }
    }
    this._copied = [];
    this._cut = [];
  }

  /**
   * Change the current cell type(s).
   */
  changeCellType(value: string): void {
    let model = this.model;
    for (let i = 0; i < model.cells.length; i++) {
      let cell = model.cells.get(i);
      if (!cell.selected && !cell.active) {
        continue;
      }
      let newCell: ICellModel;
      switch(value) {
      case 'code':
        newCell = model.createCodeCell(cell);
        break;
      case 'markdown':
        newCell = model.createMarkdownCell(cell);
        (newCell as MarkdownCellModel).rendered = false;
        break;
      default:
        newCell = model.createRawCell(cell);
        break;
      }
      model.cells.remove(cell);
      model.cells.insert(i, newCell);
    }
  }

  /**
   * Run the selected cell(s).
   */
  run(): void {
    let model = this.model;
    let cells = model.cells;
    let selected: ICellModel[] = []
    for (let i = 0; i < cells.length; i++) {
      let cell = cells.get(i);
      if (cell.selected || cell.active) {
        selected.push(cell);
      }
    }
    for (let cell of selected) {
       model.activeCellIndex = cells.indexOf(cell);
       model.runActiveCell();
    }
  }

  /**
   * Interrupt the kernel.
   */
  interrupt(): Promise<void> {
    return this.model.session.kernel.interrupt();
  }

  /**
   * Restart the kernel.
   */
  restart(): Promise<void> {
    return showDialog({
      title: 'Restart Kernel?',
      body: 'Do you want to restart the current kernel? All variables will be lost.',
      host: this.parent.node
    }).then(result => {
      if (result.text === 'OK') {
        return this.model.session.kernel.restart();
      }
    });
  }

  /**
   * Handle the DOM events for the widget.
   *
   * @param event - The DOM event sent to the widget.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the dock panel's node. It should
   * not be called directly by user code.
   */
  handleEvent(event: Event): void {
    let node: HTMLElement;
    switch (event.type) {
    case 'click':
      this._evtClick(event as MouseEvent);
      break;
    case 'mousedown':
      node = event.target as HTMLElement;
      if (node.classList.contains(TOOLBAR_BUTTON)) {
        node.classList.add(TOOLBAR_PRESSED);
      }
      break;
    case 'mouseup':
    case 'mouseout':
      let nodes = this.node.childNodes;
      for (let i = 0; i < nodes.length; i++) {
        node = nodes[i] as HTMLElement;
        node.classList.remove(TOOLBAR_PRESSED);
      }
      break;
    }
  }

  /**
   * Handle `after_attach` messages for the widget.
   */
  protected onAfterAttach(msg: Message): void {
    this.node.addEventListener('click', this);
    this.node.addEventListener('mousedown', this);
    this.node.addEventListener('mouseup', this);
    this.node.addEventListener('mouseout', this);
  }

  /**
   * Handle `before_detach` messages for the widget.
   */
  protected onBeforeDetach(msg: Message): void {
    this.node.removeEventListener('click', this);
    this.node.removeEventListener('mousedown', this);
    this.node.removeEventListener('mouseup', this);
    this.node.addEventListener('mouseout', this);
  }

  /**
   * Handle changes to the model.
   */
  protected onModelChanged(sender: INotebookModel, args: IChangedArgs<any>): void {
    switch(args.name) {
    case 'metadata':
      let name = this.model.metadata.kernelspec.display_name;
      this.kernelNameNode.textContent = name;
      break;
    case 'activeCellIndex':
      let cell = this.model.cells.get(this.model.activeCellIndex);
      this.cellTypeNode.value = cell.type;
      break;
    case 'session':
      this.handleSession();
      break;
    }
  }

  /**
   * Handle a change to the session.
   */
  protected handleSession(): void {
    let node = this.kernelIndicatorNode;
    this.model.session.kernel.statusChanged.connect((sender, status) => {
      if (status === KernelStatus.Idle) {
        node.classList.remove(TOOLBAR_BUSY);
      } else {
        node.classList.add(TOOLBAR_BUSY);
      }
    });
    if (this.model.session.status === KernelStatus.Idle) {
      node.classList.remove(TOOLBAR_BUSY);
    } else {
      node.classList.add(TOOLBAR_BUSY);
    }
  }

  /**
   * Handle `click` events for the widget.
   */
  private _evtClick(event: MouseEvent): void {
    let  names = [TOOLBAR_SAVE, TOOLBAR_INSERT, TOOLBAR_CUT,
                  TOOLBAR_COPY, TOOLBAR_PASTE,
                  TOOLBAR_RUN, TOOLBAR_INTERRUPT,
                  TOOLBAR_RESTART, TOOLBAR_CELL, 
                  TOOLBAR_KERNEL, TOOLBAR_INDICATOR];
    let selected = '';
    for (let name of names) {
      if ((event.target as HTMLElement).className.indexOf(name) !== -1) {
        selected = name;
        break;
      }
    }
    let index: number;
    switch(selected) {
    case TOOLBAR_SAVE:
      this.model.save();
      break;
    case TOOLBAR_INSERT:
      this.insertBelow();
      break;
    case TOOLBAR_CUT:
      this.cut();
      break;
    case TOOLBAR_COPY:
      this.copy();
      break;
    case TOOLBAR_PASTE:
      this.paste();
      break;
    case TOOLBAR_RUN:
      this.run();
      break;
    case TOOLBAR_INTERRUPT:
      this.interrupt();
      break;
    case TOOLBAR_RESTART:
      this.restart();
      break;
    }
  }

  private _model: INotebookModel = null;
  private _copied: number[] = [];
  private _cut: ICellModel[] = [];
}


/**
 * A namespace for Notebook widget private data.
 */
namespace Private {
  /**
   * Scroll an element into view if needed.
   *
   * @param area - The scroll area element.
   *
   * @param elem - The element of interest.
   */
  export
  function scrollIfNeeded(area: HTMLElement, elem: HTMLElement): void {
    let ar = area.getBoundingClientRect();
    let er = elem.getBoundingClientRect();
    if (er.top < ar.top) {
      area.scrollTop -= ar.top - er.top;
    } else if (er.bottom > ar.bottom) {
      area.scrollTop += er.bottom - ar.bottom;
    }
  }
}
