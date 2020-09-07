import * as React from 'react'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { Row } from '../lib/row'
import { VerticalSegmentedControl } from '../lib/vertical-segmented-control'

interface IProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly commit: string
  readonly onDismissed: () => void
}

interface IState {
  readonly selectedStashAction: CheckoutAction
}

enum CheckoutAction {
  Stash,
  Discard,
}

export class CheckoutToCommit extends React.Component<IProps, IState> {

  public constructor(props: IProps) {
    super(props);

    this.state = {
      selectedStashAction: CheckoutAction.Stash
    }
  }

  private onSelectionChanged = (action: CheckoutAction) => {
    this.setState({ selectedStashAction: action })
  }

  private onSubmit = async () => {
    switch (this.state.selectedStashAction) {
      case CheckoutAction.Discard:
        return this.props.dispatcher.discardAndCheckout(
          this.props.repository,
          this.props.commit
        )
      case CheckoutAction.Stash:
        return this.props.dispatcher.stashAndCheckout(
          this.props.repository,
          this.props.commit
        )
    }
  }

  private renderStashActions() {
    const items = []

    items.push({
      title: `Stash my changes`,
      key: CheckoutAction.Stash,
    })

    items.push({
      title: `Discard my changes`,
      key: CheckoutAction.Discard,
    })

    return (
      <Row>
        <VerticalSegmentedControl
          label="You have changes on this branch. What would you like to do with them?"
          items={items}
          selectedKey={this.state.selectedStashAction}
          onSelectionChanged={this.onSelectionChanged}
        />
      </Row>
    )
  }

  public render() {
    return <Dialog
      id="stash-changes"
      title="To checkout you need stash or discard all local changes"
      onSubmit={this.onSubmit}
      onDismissed={this.props.onDismissed}
    >
      <DialogContent>
        {this.renderStashActions()}
      </DialogContent>
      <DialogFooter>
        <OkCancelButtonGroup okButtonText="Checkout"/>
      </DialogFooter>
    </Dialog>
  }
}