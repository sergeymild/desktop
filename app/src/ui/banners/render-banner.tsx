import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'

import { Banner, BannerType } from '../../models/banner'

import { MergeConflictsBanner } from './merge-conflicts-banner'

import { SuccessfulMerge } from './successful-merge'
import { RebaseConflictsBanner } from './rebase-conflicts-banner'
import { SuccessfulRebase } from './successful-rebase'
import { BranchAlreadyUpToDate } from './branch-already-up-to-date-banner'
import { SuccessfulCherryPick } from './successful-cherry-pick'
import { StashApplied } from './banner-stash-applied'
import { StashPopped } from './banner-stash-popped'

export function renderBanner(banner: Banner): JSX.Element {
  switch (banner.type) {
    case BannerType.SuccessfulMerge:
      return (
        <SuccessfulMerge
          ourBranch={banner.ourBranch}
          theirBranch={banner.theirBranch}
          key={'successful-merge'}
        />
      )
    case BannerType.SuccessfulCherryPick:
      return (
        <SuccessfulCherryPick
          ourBranch={banner.ourBranch}
          theirBranch={banner.theirBranch}
          key={'successful-cherry-pick'}
        />
      )
    case BannerType.MergeConflictsFound:
      return (
        <MergeConflictsBanner
          ourBranch={banner.ourBranch}
          popup={banner.popup}
          key={'merge-conflicts'}
        />
      )
    case BannerType.SuccessfulRebase:
      return (
        <SuccessfulRebase
          targetBranch={banner.targetBranch}
          baseBranch={banner.baseBranch}
          key={'successful-rebase'}
        />
      )
    case BannerType.RebaseConflictsFound:
      return (
        <RebaseConflictsBanner
          targetBranch={banner.targetBranch}
          onOpenDialog={banner.onOpenDialog}
          key={'merge-conflicts'}
        />
      )
    case BannerType.BranchAlreadyUpToDate:
      return (
        <BranchAlreadyUpToDate
          ourBranch={banner.ourBranch}
          theirBranch={banner.theirBranch}
          key={'branch-already-up-to-date'}
        />
      )
    case BannerType.StashApplied:
      return (
        <StashApplied
          stashName={banner.stashName}
          key={'stash-applied'}
        />
      )
    case BannerType.StashPopped:
      return (
        <StashPopped
          stashName={banner.stashName}
          key={'stash-applied'}
        />
      )
    default:
      return assertNever(banner, `Unknown popup type: ${banner}`)
  }
}
