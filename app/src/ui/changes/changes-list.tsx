import * as React from 'react'
import * as Path from 'path'
import { Dispatcher } from '../dispatcher'
import { IMenuItem } from '../../lib/menu-item'
import { revealInFileManager } from '../../lib/app-shell'
import { AppFileStatusKind, WorkingDirectoryFileChange, WorkingDirectoryStatus } from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { Repository } from '../../models/repository'
import { IAuthor } from '../../models/author'
import { ClickSource, List } from '../lib/list'
import { CheckboxValue } from '../lib/checkbox'
import {
  CopyFilePathLabel,
  DefaultEditorLabel,
  isSafeFileExtension,
  OpenWithDefaultProgramLabel,
  RevealInFileManagerLabel,
} from '../lib/context-menu'
import { ChangedFile } from './changed-file'
import { showContextualMenu } from '../main-process-proxy'
import { arrayEquals } from '../../lib/equality'
import { clipboard } from 'electron'
import { ICommitContext } from '../../models/commit'
import { ConflictState, RebaseConflictState } from '../../lib/app-state'
import { ContinueRebase } from './continue-rebase'
import { hasConflictedFiles } from '../../lib/status'
import { ChangesListMenu } from './changes-list-menu'
import { ChangesListHeader } from './changes-list-header'
import { PopupType } from '../../models/popup'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { dispatcher } from '../index'

const RowHeight = 29


const GitIgnoreFileName = '.gitignore'

/** Compute the 'Include All' checkbox value from the repository state */
export function getIncludeAllValue(
  workingDirectory: WorkingDirectoryStatus,
  rebaseConflictState: RebaseConflictState | null,
) {
  if (rebaseConflictState !== null) {
    if (workingDirectory.files.length === 0) {
      // the current commit will be skipped in the rebase
      return CheckboxValue.Off
    }

    // untracked files will be skipped by the rebase, so we need to ensure that
    // the "Include All" checkbox matches this state
    const onlyUntrackedFilesFound = workingDirectory.files.every(
      f => f.status.kind === AppFileStatusKind.Untracked,
    )

    if (onlyUntrackedFilesFound) {
      return CheckboxValue.Off
    }

    const onlyTrackedFilesFound = workingDirectory.files.every(
      f => f.status.kind !== AppFileStatusKind.Untracked,
    )

    // show "Mixed" if we have a mixture of tracked and untracked changes
    return onlyTrackedFilesFound ? CheckboxValue.On : CheckboxValue.Mixed
  }

  const { includeAll } = workingDirectory
  if (includeAll === true) {
    return CheckboxValue.On
  } else if (includeAll === false) {
    return CheckboxValue.Off
  } else {
    return CheckboxValue.Mixed
  }
}

interface IChangesListProps {
  readonly repository: Repository
  readonly workingDirectory: WorkingDirectoryStatus
  /**
   * An object containing the conflicts in the working directory.
   * When null it means that there are no conflicts.
   */
  readonly conflictState: ConflictState | null
  readonly rebaseConflictState: RebaseConflictState | null
  readonly selectedFileIDs: ReadonlyArray<string>
  readonly onFileSelectionChanged: (rows: ReadonlyArray<number>) => void
  readonly onIncludeChanged: (path: string, include: boolean) => void
  readonly onSelectAll: (selectAll: boolean) => void
  readonly onCreateCommit: (context: ICommitContext) => Promise<boolean>
  readonly onDiscardChanges: (file: WorkingDirectoryFileChange) => void
  readonly askForConfirmationOnDiscardChanges: boolean
  readonly onDiscardChangesFromFiles: (
    files: ReadonlyArray<WorkingDirectoryFileChange>,
    isDiscardingAllChanges: boolean,
  ) => void

  /** Callback that fires on page scroll to pass the new scrollTop location */
  readonly onChangesListScrolled: (scrollTop: number) => void

  /* The scrollTop of the compareList. It is stored to allow for scroll position persistence */
  readonly changesListScrollTop?: number

  /**
   * Called to open a file it its default application
   *
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenItem: (path: string) => void
  /**
   * The currently checked out branch (null if no branch is checked out).
   */
  readonly branch: string | null
  readonly dispatcher: Dispatcher
  readonly availableWidth: number
  readonly isCommitting: boolean
  readonly currentBranchProtected: boolean

  /**
   * Click event handler passed directly to the onRowClick prop of List, see
   * List Props for documentation.
   */
  readonly onRowClick?: (row: number, source: ClickSource) => void

  /** Called when the given pattern should be ignored. */
  readonly onIgnore: (pattern: string | string[]) => void

  /**
   * Whether or not to show a field for adding co-authors to
   * a commit (currently only supported for GH/GHE repositories)
   */
  readonly showCoAuthoredBy: boolean

  /**
   * A list of authors (name, email pairs) which have been
   * entered into the co-authors input box in the commit form
   * and which _may_ be used in the subsequent commit to add
   * Co-Authored-By commit message trailers depending on whether
   * the user has chosen to do so.
   */
  readonly coAuthors: ReadonlyArray<IAuthor>

  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

}

interface IChangesState {
  readonly selectedRows: ReadonlyArray<number>
}

function getSelectedRowsFromProps(
  props: IChangesListProps,
): ReadonlyArray<number> {
  const selectedFileIDs = props.selectedFileIDs
  const selectedRows = []

  for (const id of selectedFileIDs) {
    const ix = props.workingDirectory.findFileIndexByID(id)
    if (ix !== -1) {
      selectedRows.push(ix)
    }
  }

  return selectedRows
}

export class ChangesList extends React.Component<IChangesListProps,
  IChangesState> {
  public constructor(props: IChangesListProps) {
    super(props)
    this.state = {
      selectedRows: getSelectedRowsFromProps(props),
    }
  }

  public componentWillReceiveProps(nextProps: IChangesListProps) {
    // No need to update state unless we haven't done it yet or the
    // selected file id list has changed.
    if (
      !arrayEquals(nextProps.selectedFileIDs, this.props.selectedFileIDs) ||
      !arrayEquals(
        nextProps.workingDirectory.files,
        this.props.workingDirectory.files,
      )
    ) {
      this.setState({ selectedRows: getSelectedRowsFromProps(nextProps) })
    }
  }

  private onIncludeAllChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    this.props.onSelectAll(include)
  }

  private renderRow = (row: number): JSX.Element => {
    const {
      workingDirectory,
      rebaseConflictState,
      isCommitting,
      onIncludeChanged,
      availableWidth,
    } = this.props

    const file = workingDirectory.files[row]
    const selection = file.selection.getSelectionType()

    const includeAll =
      selection === DiffSelectionType.All
        ? true
        : selection === DiffSelectionType.None
        ? false
        : null

    const include =
      rebaseConflictState !== null
        ? file.status.kind !== AppFileStatusKind.Untracked
        : includeAll

    const disableSelection = isCommitting || rebaseConflictState !== null

    return (
      <ChangedFile
        file={file}
        include={include}
        key={file.id}
        onContextMenu={this.onItemContextMenu}
        onIncludeChanged={onIncludeChanged}
        availableWidth={availableWidth}
        disableSelection={disableSelection}
      />
    )
  }

  private onDiscardAllChanges = () => {
    this.props.onDiscardChangesFromFiles(
      this.props.workingDirectory.files,
      true,
    )
  }

  private onDiscardChanges = (files: ReadonlyArray<string>) => {
    const workingDirectory = this.props.workingDirectory

    if (files.length === 1) {
      const modifiedFile = workingDirectory.files.find(f => f.path === files[0])

      if (modifiedFile != null) {
        this.props.onDiscardChanges(modifiedFile)
      }
    } else {
      const modifiedFiles = new Array<WorkingDirectoryFileChange>()

      files.forEach(file => {
        const modifiedFile = workingDirectory.files.find(f => f.path === file)

        if (modifiedFile != null) {
          modifiedFiles.push(modifiedFile)
        }
      })

      if (modifiedFiles.length > 0) {
        // DiscardAllChanges can also be used for discarding several selected changes.
        // Therefore, we update the pop up to reflect whether or not it is "all" changes.
        const discardingAllChanges =
          modifiedFiles.length === workingDirectory.files.length

        this.props.onDiscardChangesFromFiles(
          modifiedFiles,
          discardingAllChanges,
        )
      }
    }
  }

  private onStashChanges = () => {
    this.props.dispatcher.createStashForCurrentBranch(this.props.repository)
  }

  private getDiscardChangesMenuItemLabel = (files: ReadonlyArray<string>) => {
    const label =
      files.length === 1
        ? __DARWIN__
        ? `Discard Changes`
        : `Discard changes`
        : __DARWIN__
        ? `Discard ${files.length} Selected Changes`
        : `Discard ${files.length} selected changes`

    return this.props.askForConfirmationOnDiscardChanges ? `${label}…` : label
  }

  private onContextMenu = () => {

    // need to preserve the working directory state while dealing with conflicts
    if (this.props.rebaseConflictState !== null || this.props.isCommitting) {
      return
    }

    const stashAllChangesLabel = __DARWIN__
      ? 'Stash All Changes'
      : 'Stash all changes'

    const hasConflicts =
      this.props.conflictState !== null ||
      hasConflictedFiles(this.props.workingDirectory)

    const hasLocalChanges = this.props.workingDirectory.files.length > 0
    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Discard All Changes…' : 'Discard all changes…',
        action: this.onDiscardAllChanges,
        enabled: hasLocalChanges,
      },

      {
        label: stashAllChangesLabel,
        action: this.onStashChanges,
        enabled: hasLocalChanges && this.props.branch !== null && !hasConflicts,
      },
    ]

    showContextualMenu(items)
  }

  private getDiscardChangesMenuItem = (
    paths: ReadonlyArray<string>,
  ): IMenuItem => {
    return {
      label: this.getDiscardChangesMenuItemLabel(paths),
      action: () => this.onDiscardChanges(paths),
    }
  }

  private getCopyPathMenuItem = (
    file: WorkingDirectoryFileChange,
  ): IMenuItem => {
    return {
      label: CopyFilePathLabel,
      action: () => {
        const fullPath = Path.join(this.props.repository.path, file.path)
        clipboard.writeText(fullPath)
      },
    }
  }

  private getRevealInFileManagerMenuItem = (
    file: WorkingDirectoryFileChange,
  ): IMenuItem => {
    return {
      label: RevealInFileManagerLabel,
      action: () => revealInFileManager(this.props.repository, file.path),
      enabled: file.status.kind !== AppFileStatusKind.Deleted,
    }
  }

  private getOpenInExternalEditorMenuItem = (
    file: WorkingDirectoryFileChange,
    enabled: boolean,
  ): IMenuItem => {
    const { externalEditorLabel, repository } = this.props

    const openInExternalEditor = externalEditorLabel
      ? `Open in ${externalEditorLabel}`
      : DefaultEditorLabel

    return {
      label: openInExternalEditor,
      action: () => {
        const fullPath = Path.join(repository.path, file.path)
        dispatcher.openInExternalEditor(fullPath)
      },
      enabled,
    }
  }

  private getDefaultContextMenu(
    file: WorkingDirectoryFileChange,
  ): ReadonlyArray<IMenuItem> {
    const { id, path, status } = file

    const extension = Path.extname(path)
    const isSafeExtension = isSafeFileExtension(extension)

    const { workingDirectory, selectedFileIDs } = this.props

    const selectedFiles = new Array<WorkingDirectoryFileChange>()
    const paths = new Array<string>()
    const extensions = new Set<string>()

    const addItemToArray = (fileID: string) => {
      const newFile = workingDirectory.findFileWithID(fileID)
      if (newFile) {
        selectedFiles.push(newFile)
        paths.push(newFile.path)

        const extension = Path.extname(newFile.path)
        if (extension.length) {
          extensions.add(extension)
        }
      }
    }

    if (selectedFileIDs.includes(id)) {
      // user has selected a file inside an existing selection
      // -> context menu entries should be applied to all selected files
      selectedFileIDs.forEach(addItemToArray)
    } else {
      // this is outside their previous selection
      // -> context menu entries should be applied to just this file
      addItemToArray(id)
    }

    const items: IMenuItem[] = [
      this.getDiscardChangesMenuItem(paths),
      { type: 'separator' },
    ]
    if (paths.length === 1) {
      items.push({
        label: __DARWIN__
          ? 'Ignore File (Add to .gitignore)'
          : 'Ignore file (add to .gitignore)',
        action: () => this.props.onIgnore(path),
        enabled: Path.basename(path) !== GitIgnoreFileName,
      })
    } else if (paths.length > 1) {
      items.push({
        label: __DARWIN__
          ? `Ignore ${paths.length} Selected Files (Add to .gitignore)`
          : `Ignore ${paths.length} selected files (add to .gitignore)`,
        action: () => {
          // Filter out any .gitignores that happens to be selected, ignoring
          // those doesn't make sense.
          this.props.onIgnore(
            paths.filter(path => Path.basename(path) !== GitIgnoreFileName),
          )
        },
        // Enable this action as long as there's something selected which isn't
        // a .gitignore file.
        enabled: paths.some(path => Path.basename(path) !== GitIgnoreFileName),
      })
    }
    // Five menu items should be enough for everyone
    Array.from(extensions)
      .slice(0, 5)
      .forEach(extension => {
        items.push({
          label: __DARWIN__
            ? `Ignore All ${extension} Files (Add to .gitignore)`
            : `Ignore all ${extension} files (add to .gitignore)`,
          action: () => this.props.onIgnore(`*${extension}`),
        })
      })

    const enabled = isSafeExtension && status.kind !== AppFileStatusKind.Deleted

    items.push(
      { type: 'separator' },
      this.getCopyPathMenuItem(file),
      this.getRevealInFileManagerMenuItem(file),
      this.getOpenInExternalEditorMenuItem(file, enabled),
      {
        label: OpenWithDefaultProgramLabel,
        action: () => this.props.onOpenItem(path),
        enabled,
      },
    )

    return items
  }

  private getRebaseContextMenu(
    file: WorkingDirectoryFileChange,
  ): ReadonlyArray<IMenuItem> {
    const { path, status } = file

    const extension = Path.extname(path)
    const isSafeExtension = isSafeFileExtension(extension)

    const items = new Array<IMenuItem>()

    if (file.status.kind === AppFileStatusKind.Untracked) {
      items.push(this.getDiscardChangesMenuItem([file.path]), {
        type: 'separator',
      })
    }

    const enabled = isSafeExtension && status.kind !== AppFileStatusKind.Deleted

    items.push(
      this.getCopyPathMenuItem(file),
      this.getRevealInFileManagerMenuItem(file),
      this.getOpenInExternalEditorMenuItem(file, enabled),
      {
        label: OpenWithDefaultProgramLabel,
        action: () => this.props.onOpenItem(path),
        enabled,
      },
    )

    return items
  }

  private onItemContextMenu = (
    file: WorkingDirectoryFileChange,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (this.props.isCommitting) {
      return
    }

    event.preventDefault()

    const items =
      this.props.rebaseConflictState === null
        ? this.getDefaultContextMenu(file)
        : this.getRebaseContextMenu(file)

    showContextualMenu(items)
  }


  private onScroll = (scrollTop: number, clientHeight: number) => {
    this.props.onChangesListScrolled(scrollTop)
  }

  private handleCommitClick = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.Commit,
      repository: this.props.repository,
    })
  }

  private renderCommitMessageForm = (): JSX.Element => {
    const {
      rebaseConflictState,
      workingDirectory,
      repository,
      dispatcher,
      isCommitting,
    } = this.props

    if (rebaseConflictState !== null) {
      const hasUntrackedChanges = workingDirectory.files.some(
        f => f.status.kind === AppFileStatusKind.Untracked,
      )

      return (
        <ContinueRebase
          dispatcher={dispatcher}
          repository={repository}
          rebaseConflictState={rebaseConflictState}
          workingDirectory={workingDirectory}
          isCommitting={isCommitting}
          hasUntrackedChanges={hasUntrackedChanges}
        />
      )
    }

    return (
      <Row className="merge-button-row">
      <Button
        type="submit"
        className="commit-button button-component-primary merge-button"
        disabled={this.props.workingDirectory.files.length === 0}
        onClick={this.handleCommitClick}
      >Commit</Button>
      </Row>
    )
  }

  private onRowKeyDown = (
    _row: number,
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    // The commit is already in-flight but this check prevents the
    // user from changing selection.
    if (
      this.props.isCommitting &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault()
    }

    return
  }

  public render() {

    return (
      <div className="changes-list-container file-list">
        <ChangesListMenu
          stashChanges={this.onStashChanges}
          discardChanges={this.onDiscardAllChanges}
          filesCount={this.props.workingDirectory.files.length}
        />
        <ChangesListHeader
          onContextMenu={this.onContextMenu}
          workingDirectory={this.props.workingDirectory}
          isCommitting={this.props.isCommitting}
          onIncludeAllChanged={this.onIncludeAllChanged}
          rebaseConflictState={this.props.rebaseConflictState}
        />
        <List
          id="changes-list"
          rowCount={this.props.workingDirectory.files.length}
          rowHeight={RowHeight}
          rowRenderer={this.renderRow}
          selectedRows={this.state.selectedRows}
          selectionMode="multi"
          onSelectionChanged={this.props.onFileSelectionChanged}
          invalidationProps={this.props.workingDirectory}
          onRowClick={this.props.onRowClick}
          onScroll={this.onScroll}
          setScrollTop={this.props.changesListScrollTop}
          onRowKeyDown={this.onRowKeyDown}
        />
        {this.renderCommitMessageForm()}
      </div>
    )
  }
}
