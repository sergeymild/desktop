import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { DiffType, LineEndingsChange } from '../../models/diff'
import { iconForStatus, Octicon, OcticonSymbol } from '../octicons'
import { mapStatus } from '../../lib/status'
import { dispatcher } from '../index'
import { Select } from '../lib/select'
import { enableSideBySideDiffs } from '../../lib/feature-flag'
import { DiffOptions } from '../diff/diff-options'

interface IProps {
  readonly path: string
  readonly status: AppFileStatus
  readonly diffKing?: DiffType
  readonly lineEndingsChange?: LineEndingsChange
  readonly unified: number

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Called when the user changes the side by side diffs setting. */
  readonly onShowSideBySideDiffChanged: (checked: boolean) => void

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void
}

/** Displays information about a file */
export class ChangedFileDetails extends React.PureComponent<IProps, {}> {
  private renderDecorator() {
    const {diffKing, lineEndingsChange} = this.props

    if (diffKing === undefined) { return null }

    if (diffKing === DiffType.Text && lineEndingsChange !== undefined) {
      const message = `Warning: line endings will be changed from '${lineEndingsChange.from}' to '${lineEndingsChange.to}'.`
      return (
        <Octicon
          symbol={OcticonSymbol.alert}
          className={'line-endings'}
          title={message}
        />
      )
    } else {
      return null
    }
  }

  private updateUnifiedCount(event: React.FormEvent<HTMLSelectElement>) {
    dispatcher.updateUnifiedCount(parseInt(event.currentTarget.value, 10))
  }

  private renderSelectUnifiedCount() {
    return <Select
      label={"Context"}
      value={`${this.props.unified}`}
      onChange={this.updateUnifiedCount}
    >
      {Array.from(Array(51).keys()).map(n => (
        <option key={n} value={n}>{n}</option>
      ))}
    </Select>
  }

  private onShowSideBySideDiffChanged = (isChecked: boolean) => {
    this.props.onShowSideBySideDiffChanged(isChecked)
  }

  public render() {
    const status = this.props.status
    const fileStatus = mapStatus(status!)

    return (
      <div className="header">
        <PathLabel path={this.props.path} status={this.props.status!} />
        {this.renderDecorator()}
        {this.renderSelectUnifiedCount()}
        {enableSideBySideDiffs() && (
          <DiffOptions
            onShowSideBySideDiffChanged={this.onShowSideBySideDiffChanged}
            showSideBySideDiff={this.props.showSideBySideDiff}
            onDiffOptionsOpened={this.props.onDiffOptionsOpened}
          />
        )}
        <Octicon
          symbol={iconForStatus(status!)}
          className={`status status-${fileStatus.toLowerCase()}`}
          title={fileStatus}
        />
      </div>
    )
  }
}
