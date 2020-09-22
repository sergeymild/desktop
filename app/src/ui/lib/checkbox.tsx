import * as React from 'react'
import { createUniqueId, releaseUniqueId } from './id-pool'

/** The possible values for a Checkbox component. */
export enum CheckboxValue {
  On,
  Off,
  Mixed,
}

interface ICheckboxProps {
  /** Is the component disabled. */
  readonly disabled?: boolean

  /** The current value of the component. */
  readonly value: CheckboxValue

  /** The function to call on value change. */
  readonly onChange?: (isChecked: boolean) => void

  /** The tab index of the input element. */
  readonly tabIndex?: number

  /** The label for the checkbox. */
  readonly label?: string | JSX.Element
}

interface ICheckboxState {
  /**
   * An automatically generated id for the input element used to reference
   * it from the label element. This is generated once via the id pool when the
   * component is mounted and then released once the component unmounts.
   */
  readonly inputId?: string
}

/** A checkbox component which supports the mixed value. */
export class Checkbox extends React.PureComponent<ICheckboxProps, ICheckboxState> {
  private input: HTMLInputElement | null = null

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    if (this.props.onChange) {
      this.props.onChange(event.currentTarget.checked)
    }
  }

  public componentDidUpdate() {
    this.updateInputState()
  }

  public componentWillMount() {
    const friendlyName = this.props.label || 'unknown'
    const inputId = createUniqueId(`Checkbox_${friendlyName}`)

    this.setState({ inputId })
  }

  public componentWillUnmount() {
    if (this.state.inputId) {
      releaseUniqueId(this.state.inputId)
    }
  }

  private updateInputState() {
    const input = this.input
    if (input) {
      const value = this.props.value
      input.indeterminate = value === CheckboxValue.Mixed
      input.checked = value !== CheckboxValue.Off
    }
  }

  private onInputRef = (input: HTMLInputElement | null) => {
    this.input = input
    // Necessary since componentDidUpdate doesn't run on initial
    // render
    this.updateInputState()
  }

  public render() {
    const inputId = this.state.inputId

    return (
      <label className="checkbox-component filled-in" htmlFor={inputId}>
        <input
          id={this.state.inputId}
          tabIndex={this.props.tabIndex}
          type="checkbox"
          onChange={this.onChange}
          ref={this.onInputRef}
          disabled={this.props.disabled}
        />
        <span>{this.props.label}</span>
      </label>
    )
  }
}
