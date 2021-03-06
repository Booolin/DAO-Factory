// SPDX-License-Identifier: MIT

pragma solidity >=0.4.22 <0.8.0;

// predefined project FSM
enum ProjectStatus {
    Created, // just created, waiting for details
    Initialized, // ready for audition
    Raising, // raising funds
    Refunding, // somehow the project is doomed, refunding all already raised tokens back to investors
    Canceled, // stop to proceed
    Failed, // fail to raise enough amount to proceed
    Succeeded, // enough amount raised, locked in this project, insurance is expected
    Rolling, // voting to try get certain amount of locked tokens
    PhaseFailed, // when a phase has not been passed
    ReplanVoting, // voting for a new plan
    ReplanFailed,
    Liquidating, // the project is a failure, investors are getting the rest of their investment back
    AllPhasesDone, // there is nothing left to do, just wait for the magic
    Repaying, // project is done, repay profit to investors
    Finished, // the project has totally finished its destination
    Auditing,
    ReplanNotice,
    Audited,
    InsurancePaid
}
