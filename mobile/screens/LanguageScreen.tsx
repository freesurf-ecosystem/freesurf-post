import React from "react";
import { useNavigation } from "@react-navigation/native";
import LanguageChooser from "./LanguageChooser";

export default function LanguageScreen() {
  const nav = useNavigation();
  return (
    <LanguageChooser
      onDone={() => nav.goBack()}
      onSelect={() => {}}
    />
  );
}