/* global jest */
// The keyboard library is native; its own Jest mock renders plain views.
jest.mock("react-native-keyboard-controller", () => require("react-native-keyboard-controller/jest"));
