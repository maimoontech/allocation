import type { ReactNode } from "react";
import type { ImageUploadValue } from "../../../components/ui/ImageUpload";
import type { TabProps } from "./shared";
import { Tab01Personal } from "./Tab01Personal";
import { Tab02TitlePrefix } from "./Tab02TitlePrefix";
import { Tab03Hizb } from "./Tab03Hizb";
import { Tab04Occupation } from "./Tab04Occupation";
import { Tab05EducationHifz } from "./Tab05EducationHifz";
import { Tab06Health } from "./Tab06Health";
import { Tab07Sharaf } from "./Tab07Sharaf";
import { Tab08PlacesVisited } from "./Tab08PlacesVisited";
import { Tab09Ashara } from "./Tab09Ashara";
import { Tab10Asbaq } from "./Tab10Asbaq";
import { Tab11Tamreen } from "./Tab11Tamreen";
import { Tab12Khidmat } from "./Tab12Khidmat";

/**
 * The twelve tabs, their ids, labels and the panel each one renders.
 *
 * Extracted from `MemberProfilePage` when administrators and Zonal Heads gained a read of the
 * same profile (FR-047a). Two pages rendering twelve branches each is two places for a tab to
 * be forgotten — and the one that would get forgotten is the admin view, which nobody uses
 * daily. One switch, two callers.
 *
 * The member's page passes the photo handlers; the admin view does not, and Tab 1 renders the
 * photograph read-only without them.
 */

export const TAB_IDS = {
  personal: "personal",
  title: "title",
  hizb: "hizb",
  occupation: "occupation",
  education: "education",
  health: "health",
  sharaf: "sharaf",
  places: "places",
  ashara: "ashara",
  asbaq: "asbaq",
  tamreen: "tamreen",
  khidmat: "khidmat"
} as const;

/** The full twelve, in the order the requirement lists them. */
export const ALL_TABS: Array<{ id: string; label: string }> = [
  { id: TAB_IDS.personal, label: "Personal" },
  { id: TAB_IDS.title, label: "Title & Prefix" },
  { id: TAB_IDS.hizb, label: "Hizb" },
  { id: TAB_IDS.occupation, label: "Occupation" },
  { id: TAB_IDS.education, label: "Education / Hifz" },
  { id: TAB_IDS.health, label: "Health & Fitness" },
  { id: TAB_IDS.sharaf, label: "Sharaf" },
  { id: TAB_IDS.places, label: "Maqamaat Muqaddasah" },
  { id: TAB_IDS.ashara, label: "Ashara Mubaraka" },
  { id: TAB_IDS.asbaq, label: "Asbaq" },
  { id: TAB_IDS.tamreen, label: "Tamreen" },
  { id: TAB_IDS.khidmat, label: "Other Sansta Khidmat" }
];

/** Maps a server error's tab number onto the tab id, so the right one can be opened. */
export const TAB_BY_NUMBER: Record<number, string> = {
  1: TAB_IDS.personal,
  2: TAB_IDS.title,
  3: TAB_IDS.hizb,
  4: TAB_IDS.occupation,
  5: TAB_IDS.education,
  6: TAB_IDS.health,
  7: TAB_IDS.sharaf,
  8: TAB_IDS.places,
  9: TAB_IDS.ashara,
  10: TAB_IDS.asbaq,
  11: TAB_IDS.tamreen,
  12: TAB_IDS.khidmat
};

export type PhotoHandlers = {
  onPhotoSelect?: (photo: ImageUploadValue) => void;
  onPhotoRemove?: () => void;
  photoBusy?: boolean;
  photoVersion?: number;
  /** Where Tab 1 fetches the photograph from. Defaults to the signed-in member's own. */
  photoPath?: string;
};

export function ProfileTabPanel({
  activeTab,
  tabProps,
  photo
}: {
  activeTab: string;
  tabProps: TabProps;
  photo?: PhotoHandlers;
}): ReactNode {
  switch (activeTab) {
    case TAB_IDS.personal:
      return <Tab01Personal {...tabProps} {...photo} />;
    case TAB_IDS.title:
      return <Tab02TitlePrefix {...tabProps} />;
    case TAB_IDS.hizb:
      return <Tab03Hizb {...tabProps} />;
    case TAB_IDS.occupation:
      return <Tab04Occupation {...tabProps} />;
    case TAB_IDS.education:
      return <Tab05EducationHifz {...tabProps} />;
    case TAB_IDS.health:
      return <Tab06Health {...tabProps} />;
    case TAB_IDS.sharaf:
      return <Tab07Sharaf {...tabProps} />;
    case TAB_IDS.places:
      return <Tab08PlacesVisited {...tabProps} />;
    case TAB_IDS.asbaq:
      return <Tab10Asbaq {...tabProps} />;
    case TAB_IDS.tamreen:
      return <Tab11Tamreen {...tabProps} />;
    case TAB_IDS.khidmat:
      return <Tab12Khidmat {...tabProps} />;
    default:
      return <Tab09Ashara {...tabProps} />;
  }
}
