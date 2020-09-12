import * as React from 'react'
import { shouldRenderApplicationMenu } from './lib/features'
import { Foldout, FoldoutType } from '../lib/app-state'
import { findItemByAccessKey, IMenu, itemIsSelectable } from '../models/app-menu'
import { dispatcher } from './index'

interface IProps {
  readonly isShowingModal: boolean
  readonly currentFoldout: Foldout | null
  readonly appMenuState: ReadonlyArray<IMenu>
}

export class KeyEventsHandler extends React.PureComponent<IProps, {}> {
  /**
   * Used on non-macOS platforms to support the Alt key behavior for
   * the custom application menu. See the event handlers for window
   * keyup and keydown.
   */
  private lastKeyPressed: string | null = null

  public componentDidMount() {
    if (shouldRenderApplicationMenu()) {
      window.addEventListener('keydown', this.onWindowKeyDown)
    }
    window.addEventListener('keyup', this.onWindowKeyUp)
  }

  /**
   * On Windows pressing the Alt key and holding it down should
   * highlight the application menu.
   *
   * This method in conjunction with the onWindowKeyUp sets the
   * appMenuToolbarHighlight state when the Alt key (and only the
   * Alt key) is pressed.
   */
  private onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    if (this.props.isShowingModal) { return }

    if (shouldRenderApplicationMenu()) {
      if (event.key === 'Shift' && event.altKey) {
        dispatcher.setAccessKeyHighlightState(false)
      } else if (event.key === 'Alt') {
        if (event.shiftKey) {
          return
        }
        // Immediately close the menu if open and the user hits Alt. This is
        // a Windows convention.
        if (
          this.props.currentFoldout &&
          this.props.currentFoldout.type === FoldoutType.AppMenu
        ) {
          // Only close it the menu when the key is pressed if there's an open
          // menu. If there isn't we should close it when the key is released
          // instead and that's taken care of in the onWindowKeyUp function.
          if (this.props.appMenuState.length > 1) {
            dispatcher.setAppMenuState(menu => menu.withReset())
            dispatcher.closeFoldout(FoldoutType.AppMenu)
          }
        }

        dispatcher.setAccessKeyHighlightState(true)
      } else if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (this.props.appMenuState.length) {
          const candidates = this.props.appMenuState[0].items
          const menuItemForAccessKey = findItemByAccessKey(
            event.key,
            candidates
          )

          if (menuItemForAccessKey && itemIsSelectable(menuItemForAccessKey)) {
            if (menuItemForAccessKey.type === 'submenuItem') {
              dispatcher.setAppMenuState(menu =>
                menu
                  .withReset()
                  .withSelectedItem(menuItemForAccessKey)
                  .withOpenedMenu(menuItemForAccessKey, true)
              )

              dispatcher.showFoldout({
                type: FoldoutType.AppMenu,
                enableAccessKeyNavigation: true,
                openedWithAccessKey: true,
              })
            } else {
              dispatcher.executeMenuItem(menuItemForAccessKey)
            }

            event.preventDefault()
          }
        }
      } else if (!event.altKey) {
        dispatcher.setAccessKeyHighlightState(false)
      }
    }

    this.lastKeyPressed = event.key
  }

  /**
   * Open the application menu foldout when the Alt key is pressed.
   *
   * See onWindowKeyDown for more information.
   */
  private onWindowKeyUp = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    if (shouldRenderApplicationMenu()) {
      if (event.key === 'Alt') {
        dispatcher.setAccessKeyHighlightState(false)

        if (this.lastKeyPressed === 'Alt') {
          if (
            this.props.currentFoldout &&
            this.props.currentFoldout.type === FoldoutType.AppMenu
          ) {
            dispatcher.setAppMenuState(menu => menu.withReset())
            dispatcher.closeFoldout(FoldoutType.AppMenu)
          } else {
            dispatcher.showFoldout({
              type: FoldoutType.AppMenu,
              enableAccessKeyNavigation: true,
              openedWithAccessKey: false,
            })
          }
        }
      }
    }
  }

  public render() {
    return <></>
  }
}