
import {
  INotebookSession, IExecuteReply, IContentsManager
} from 'jupyter-js-services';

import {
  IDisposable
} from 'phosphor-disposable';

import {
  IObservableList, ObservableList, ListChangeType, IListChangedArgs
} from 'phosphor-observablelist';

import {
  IChangedArgs, Property
} from 'phosphor-properties';

import {
  ISignal, Signal, clearSignalData
} from 'phosphor-signaling';

import {
  Widget
} from 'phosphor-widget';

import {
  EditorModel, IEditorModel, IEditorOptions
} from '../editor';

import {
  InputAreaModel, IInputAreaModel
} from '../input-area';

import {
  OutputAreaModel, IOutputAreaModel
} from '../output-area';

import {
  ICellModel,
  ICodeCellModel, CodeCellModel,
  IMarkdownCellModel, MarkdownCellModel,
  IRawCellModel, isCodeCellModel, isMarkdownCellModel,
  RawCellModel, isRawCellModel
} from '../cells';

import {
  IMarkdownCell, ICodeCell,
  isMarkdownCell, isCodeCell,
  IDisplayData, isDisplayData,
  IExecuteResult, isExecuteResult, isRawCell,
  IStream, isStream, ICell, INotebookContent, INotebookMetadata,
  IError, isError, IOutput, OutputType,
  MAJOR_VERSION, MINOR_VERSION
} from './nbformat';

import {
  serialize
} from './serialize';


/**
 * The interactivity modes for a cell.
 */
export
type NotebookMode = 'command' | 'edit';


/**
 * The definition of a model object for a notebook widget.
 */
export
interface INotebookModel extends IDisposable {
  /**
   * A signal emitted when state of the notebook changes.
   */
  stateChanged: ISignal<INotebookModel, IChangedArgs<any>>;

  /**
   * The default mime type for new code cells in the notebook.
   *
   * #### Notes
   * This can be considered the default language of the notebook.
   */
  defaultMimetype: string;

  /**
   * The interactivity mode of the active cell.
   */
  mode: NotebookMode;

  /**
   * Whether the notebook has unsaved changes.
   */
  dirty: boolean;

  /**
   * Whether the notebook is read-only.
   */
  readOnly: boolean;

  /**
   * The list of cells in the notebook.
   *
   * #### Notes
   * This is a read-only property.
   */
  cells: IObservableList<ICellModel>;

  /**
   * The optional notebook session associated with the model. 
   */
  session?: INotebookSession;

  /**
   * The index of the active cell.
   */
  activeCellIndex: number;

  /**
   * A factory for creating a new code cell.
   *
   * @param source - The cell to use for the original source data.
   *
   * @returns A new code cell. If a source cell is provided, the
   *   new cell will be intialized with the data from the source.
   *
   * #### Notes
   * If the source argument does not give an input mimetype, the code cell
   * defaults to the notebook [[defaultMimetype]].
   */
  createCodeCell(source?: ICellModel): ICodeCellModel;

  /**
   * A factory for creating a new Markdown cell.
   *
   * @param source - The cell to use for the original source data.
   *
   * @returns A new markdown cell. If a source cell is provided, the
   *   new cell will be intialized with the data from the source.
   */
  createMarkdownCell(source?: ICellModel): IMarkdownCellModel;

  /**
   * A factory for creating a new raw cell.
   *
   * @param source - The cell to use for the original source data.
   *
   * @returns A new raw cell. If a source cell is provided, the
   *   new cell will be intialized with the data from the source.
   */
  createRawCell(source?: ICellModel): IRawCellModel;

  /**
   * Run the active cell, taking the appropriate action.
   */
  runActiveCell(): void;

  /**
   * Save the notebook state.
   */
  save(): Promise<void>;

  /**
   * The metadata associated with the notebook.
   */
  metadata: INotebookMetadata;
}


/**
 * An implementation of a notebook Model.
 */
export
class NotebookModel implements INotebookModel {
  /**
   * Create an editor model.
   */
  static createEditor(options?: IEditorOptions): IEditorModel {
    return new EditorModel(options);
  }

  /**
   * Create an input area model.
   */
  static createInput(editor: IEditorModel) : IInputAreaModel {
    return new InputAreaModel(editor);
  }

  /**
   * Create an output area model.
   */
  static createOutputArea(): IOutputAreaModel {
    return new OutputAreaModel();
  }

  /**
   * Construct a new notebook model.
   */
  constructor(manager: IContentsManager) {
    this._manager = manager;
    this._cells = new ObservableList<ICellModel>();
    this._cells.changed.connect(this._onCellsChanged, this);
  }

  /**
   * A signal emitted when the state of the model changes.
   */
  get stateChanged(): ISignal<INotebookModel, IChangedArgs<any>> {
    return NotebookModelPrivate.stateChangedSignal.bind(this);
  }

  /**
   * Get the observable list of notebook cells.
   *
   * #### Notes
   * This is a read-only property.
   */
  get cells(): IObservableList<ICellModel> {
    return this._cells;
  }

  /**
   * The mode of the cell.
   */
  get mode(): NotebookMode {
    return NotebookModelPrivate.modeProperty.get(this);
  }
  set mode(value: NotebookMode) {
    NotebookModelPrivate.modeProperty.set(this, value);
  }

  /**
   * The default mimetype for cells new code cells.
   */
  get defaultMimetype(): string {
    return NotebookModelPrivate.defaultMimetype.get(this);
  }
  set defaultMimetype(value: string) {
    NotebookModelPrivate.defaultMimetype.set(this, value);
  }

  /**
   * The read-only status of the notebook.
   */
  get readOnly(): boolean {
    return NotebookModelPrivate.readOnlyProperty.get(this);
  }
  set readOnly(value: boolean) {
    NotebookModelPrivate.readOnlyProperty.set(this, value);
    let cells = this._cells;
    for (let i = 0; i < cells.length; i++) {
      cells.get(i).readOnly = value;
    }
  }

  /**
   * The session for the notebook.
   */
  get session(): INotebookSession {
    return NotebookModelPrivate.sessionProperty.get(this);
  }
  set session(value: INotebookSession) {
    NotebookModelPrivate.sessionProperty.set(this, value);
  }

  /**
   * The metadata for the notebook.
   */
  get metadata(): INotebookMetadata {
    return NotebookModelPrivate.metadataProperty.get(this);
  }
  set metadata(value: INotebookMetadata) {
    NotebookModelPrivate.metadataProperty.set(this, value);
  }

  /**
   * The index of the active cell.
   *
   * #### Notes
   * The value will be clamped.  When setting this, all other cells 
   * will be marked as inactive.
   */
  get activeCellIndex(): number {
    return NotebookModelPrivate.activeCellIndexProperty.get(this);
  }
  set activeCellIndex(value: number) {
    value = Math.max(value, 0);
    value = Math.min(value, this.cells.length - 1);
    NotebookModelPrivate.activeCellIndexProperty.set(this, value);
    let cells = this.cells;
    for (let i = 0; i < cells.length; i++) {
      let cell = cells.get(i);
      cell.active = value === i;
    }
  }

  /**
   * Whether the notebook has unsaved changes.
   */
  get dirty(): boolean {
    return NotebookModelPrivate.dirtyProperty.get(this);
  }
  set dirty(value: boolean) {
    NotebookModelPrivate.dirtyProperty.set(this, value);
  }

  /**
   * Get whether the model is disposed.
   *
   * #### Notes
   * This is a read-only property.
   */
  get isDisposed(): boolean {
    return this._cells === null;
  }

  /** 
   * Dispose of the resources held by the model.
   */
  dispose(): void {
    // Do nothing if already disposed.
    if (this.isDisposed) {
      return;
    }
    let cells = this._cells;
    clearSignalData(this);
    for (let i = 0; i < cells.length; i++) {
      let cell = cells.get(i);
      cell.dispose();
    }
    cells.clear();
    this._cells = null;
  }

  /**
   * Create a code cell model.
   */
  createCodeCell(source?: ICellModel): ICodeCellModel {
    let mimetype = this.defaultMimetype;
    if (source && isCodeCellModel(source)) {
      mimetype = source.input.textEditor.mimetype;
    }
    let constructor = this.constructor as typeof NotebookModel;
    let editor = constructor.createEditor({
      mimetype,
      readOnly: this.readOnly
    });
    let input = constructor.createInput(editor);
    let output = constructor.createOutputArea();
    let cell = new CodeCellModel(input, output);
    cell.trusted = true;
    if (source) {
      cell.trusted = source.trusted;
      cell.input.textEditor.text = source.input.textEditor.text;
      cell.tags = source.tags;
      if (isCodeCellModel(source)) {
        cell.collapsed = source.collapsed;
        cell.scrolled = source.scrolled;
        for (let i = 0; i < source.output.outputs.length; i++) {
          let output = source.output.outputs.get(i);
          cell.output.outputs.add(output);
        }
      }
    }
    cell.input.textEditor.stateChanged.connect(this.onEditorChanged, this);
    return cell;
  }

  /**
   * Create a markdown cell model.
   */
  createMarkdownCell(source?: ICellModel): IMarkdownCellModel {
    let constructor = this.constructor as typeof NotebookModel;
    let editor = constructor.createEditor({ 
      mimetype: 'text/x-ipythongfm',
      readOnly: this.readOnly
    });
    let input = constructor.createInput(editor);
    let cell = new MarkdownCellModel(input);
    cell.trusted = true;
    if (source) {
      cell.trusted = source.trusted;
      cell.input.textEditor.text = source.input.textEditor.text;
      cell.tags = source.tags;
      if (isMarkdownCellModel(source)) {
        cell.rendered = source.rendered;
      }
    }
    cell.input.textEditor.stateChanged.connect(this.onEditorChanged, this);
    return cell;
  }

  /**
   * Create a raw cell model.
   */
  createRawCell(source?: ICellModel): IRawCellModel {
    let constructor = this.constructor as typeof NotebookModel;
    let editor = constructor.createEditor({
      readOnly: this.readOnly
    });
    let input = constructor.createInput(editor);
    let cell = new RawCellModel(input);
    cell.trusted = true;
    if (source) {
      cell.trusted = source.trusted;
      cell.input.textEditor.text = source.input.textEditor.text;
      cell.tags = source.tags;
      if (isRawCellModel(source)) {
        cell.format = (source as IRawCellModel).format;
      }
    }
    cell.input.textEditor.stateChanged.connect(this.onEditorChanged, this);
    return cell;
  }

  /**
   * Run the active cell, taking the appropriate action.
   */
  runActiveCell(): void {
    if (this.readOnly) {
      return;
    }
    let cell = this.cells.get(this.activeCellIndex);
    if (!cell) {
      return;
    }
    if (isMarkdownCellModel(cell)) {
      cell.trusted = true;
      cell.rendered = true;
    } else if (isCodeCellModel(cell)) {
      this.executeCell(cell as CodeCellModel);
    } else {
      cell.trusted = true;
    }
    if (this.activeCellIndex === this.cells.length - 1) {
      let cell = this.createCodeCell();
      this.cells.add(cell);
      this.mode = 'edit';  // This already sets the new index.
    } else {
      this.activeCellIndex += 1;
    }
  }

  /**
   * Save the notebook and clear the dirty state of the model.
   *
   * #### Notes
   * Also updates the metadata if there is a current session.
   */
  save(): Promise<void> {
    if (!this.session || this.session.isDisposed) {
      return this._save();
    }
    return this.session.kernel.getKernelSpec().then(spec => {
      this.metadata.kernelspec.display_name = spec.display_name;
      this.metadata.kernelspec.name = this.session.kernel.name;
      return this.session.kernel.kernelInfo();
    }).then(info => {
      this.metadata.language_info = info.language_info;
      return this._save();
    });
  }

  /**
   * Execute the given cell. 
   */
  protected executeCell(cell: CodeCellModel): void {
    if (this.readOnly) {
      return;
    }
    let text = cell.input.textEditor.text.trim();
    if (!text) {
      cell.input.prompt = 'In [ ]:';
      return;
    }
    let session = this.session;
    if (!session) {
      return;
    }
    cell.input.prompt = 'In [*]:';
    let exRequest = {
      code: cell.input.textEditor.text,
      silent: false,
      store_history: true,
      stop_on_error: true,
      allow_stdin: true
    };
    let output = cell.output;
    let ex = this.session.kernel.execute(exRequest);
    output.clear(false);
    cell.trusted = true;
    ex.onIOPub = (msg => {
      let model = msg.content;
      if (model !== void 0) {
        model.output_type = msg.header.msg_type as OutputType;
        output.add(model)
      }
    });
    ex.onReply = (msg => {
      cell.executionCount = (msg.content as IExecuteReply).execution_count;
    });
  }

  /**
   * Handle changes to cell editors.
   */
  protected onEditorChanged(editor: IEditorModel, args: IChangedArgs<any>): void {
    if (args.name === 'text') {
      this.dirty = true;
    }
  }

  /**
   * Save the notebook contents to disk.
   */
  private _save(): Promise<void> {
    let content = serialize(this);
    let name = this.session.notebookPath;
    return this._manager.save(name, { type: 'notebook', content })
    .then(() => { this.dirty = false });
  }

  /**
   * Handle a change in the cells list.
   */
  private _onCellsChanged(list: ObservableList<ICellModel>, change: IListChangedArgs<ICellModel>): void {
    switch(change.type) {
    case ListChangeType.Add:
      let cell = change.newValue as ICellModel;
      cell.stateChanged.connect(this._onCellStateChanged, this);
      this.activeCellIndex = change.newIndex;
      break;
    case ListChangeType.Remove:
      (change.oldValue as ICellModel).dispose();
      this.activeCellIndex = Math.min(change.oldIndex, this.cells.length - 1);
      break;
    case ListChangeType.Replace:
      let oldValues = change.oldValue as ICellModel[];
      for (let cell of oldValues) {
        cell.dispose();
      }
      break;
    }
  }

  /**
   * Handle a change to a cell state.
   */
  private _onCellStateChanged(cell: ICellModel, change: IChangedArgs<any>): void {
    if (change.name === 'mode') {
      let cells = this.cells;
      for (let i = 0; i < cells.length; i++) {
        if (cells.get(i) === cell) {
          this.activeCellIndex = i;
        }
      }
    }
  }

  private _cells: IObservableList<ICellModel> = null;
  private _manager: IContentsManager = null;
}


/**
 * A private namespace for notebook model data.
 */
namespace NotebookModelPrivate {
  /**
   * A signal emitted when the state of the model changes.
   */
  export
  const stateChangedSignal = new Signal<INotebookModel, IChangedArgs<any>>();

 /**
  * A property descriptor for the active cell interactivity mode.
  */
  export
  const modeProperty = new Property<INotebookModel, NotebookMode>({
    name: 'mode',
    notify: stateChangedSignal,
  });

  /**
  * A property descriptor which holds the default mimetype for new code cells.
  */
  export
  const defaultMimetype = new Property<NotebookModel, string>({
    name: 'defaultMimetype',
    value: "text/x-ipython",
    notify: stateChangedSignal,
  });

  /**
  * A property descriptor which holds the read only status of the notebook.
  */
  export
  const readOnlyProperty = new Property<NotebookModel, boolean>({
    name: 'readOnly',
    notify: stateChangedSignal,
  });

 /**
  * A property descriptor which holds the session of the notebook.
  */
  export
  const sessionProperty = new Property<NotebookModel, INotebookSession>({
    name: 'session',
    notify: stateChangedSignal,
  });

 /**
  * A property descriptor which holds the metadata of the notebook.
  */
  export
  const metadataProperty = new Property<NotebookModel, INotebookMetadata>({
    name: 'metadata',
    notify: stateChangedSignal,
  });

  /**
  * A property descriptor for the active cell index.
  */
  export
  const activeCellIndexProperty = new Property<NotebookModel, number>({
    name: 'activeCellIndex',
    notify: stateChangedSignal,
  });

 /**
  * A property descriptor for the dirty state of the notebook.
  */
  export
  const dirtyProperty = new Property<NotebookModel, boolean>({
    name: 'dirty',
    notify: stateChangedSignal,
  });
}
