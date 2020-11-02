import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogError, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'

import { startTimer } from '../lib/timing'
import { Ref } from '../lib/ref'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { ITagItem } from '../../lib/git'

interface ICreateTagProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly targetCommitSha: string
  readonly initialName?: string
  readonly localTags: ReadonlyArray<ITagItem> | null
}

interface ICreateTagState {
  readonly tagName: string
  readonly tagMessage: string | null

  /**
   * Note: once tag creation has been initiated this value stays at true
   * and will never revert to being false. If the tag creation operation
   * fails this dialog will still be dismissed and an error dialog will be
   * shown in its place.
   */
  readonly isCreatingTag: boolean
}

const MaxTagNameLength = 245

/** The Create Tag component. */
export class CreateTag extends React.Component<
  ICreateTagProps,
  ICreateTagState
> {
  public constructor(props: ICreateTagProps) {
    super(props)

    const tags = this.props.localTags ?? []

    this.state = {
      tagName: props.initialName || (tags.length > 0 ? tags[0].name : ""),
      tagMessage: null,
      isCreatingTag: false,
    }
  }

  public render() {
    const error = this.getCurrentError()
    const disabled = error !== null || this.state.tagName.length === 0

    return (
      <Dialog
        id="create-tag"
        title="Create a tag"
        onSubmit={this.createTag}
        onDismissed={this.props.onDismissed}
        loading={this.state.isCreatingTag}
        disabled={this.state.isCreatingTag}
      >
        {error && <DialogError>{error}</DialogError>}

        <DialogContent>
          <RefNameTextBox
            label="Name"
            initialValue={this.state.tagName}
            onValueChange={this.updateTagName}
          />
          <RefNameTextBox
            label="Message"
            onValueChange={this.updateTagMessage}
          />
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Create tag"
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private getCurrentError(): JSX.Element | null {
    if (this.state.tagName.length > MaxTagNameLength) {
      return (
        <>The tag name cannot be longer than {MaxTagNameLength} characters</>
      )
    }

    if (this.state.tagMessage && this.state.tagMessage.length > MaxTagNameLength) {
      return (
        <>The tag message cannot be longer than {MaxTagNameLength} characters</>
      )
    }

    const alreadyExists =
      this.props.localTags &&
      this.props.localTags.findIndex(t => t.name === this.state.tagName) >= 0
    if (alreadyExists) {
      return (
        <>A tag named <Ref>{this.state.tagName}</Ref> already exists</>
      )
    }

    return null
  }

  private updateTagName = (tagName: string) => {
    this.setState({ tagName })
  }

  private updateTagMessage = (tagMessage: string) => {
    this.setState({ tagMessage })
  }

  private createTag = async () => {
    const name = this.state.tagName
    const repository = this.props.repository

    if (name.length > 0) {
      this.setState({ isCreatingTag: true })

      const timer = startTimer('create tag', repository)
      await this.props.dispatcher.createTag(
        repository,
        name,
        this.state.tagMessage,
        this.props.targetCommitSha
      )
      timer.done()
    }
  }
}
