<?php
/**
 * Created by PhpStorm.
 * User: macbook
 * Date: 10/02/14
 * Time: 1:05 PM
 */

class HijriCalendar {

    protected $aDate;
    protected $wdNames = array("Ahad", "Ithnin", "Thulatha", "Arbaa", "Khams", "Jumuah", "Sabt");
    protected $iMonthNames =  array("Moharram-ul-Haram", "Safar-ul-Muzzafar", "Rabi-ul-Awwal", "Rabi-ul-Akhar",
                    "Jammad-il-Ula", "Jammad-il-Ukhra", "Rajab-ul-Asab", "Shaban-ul-Karim",
                    "Ramadan-al-Moazzam", "Shawwal-ul-Mukkaram", "Zilqadatil-Haram", "Zilhajjatil-Haram");

//    public function __construct($date = false,$adjustment = 0) {
//        $this->aDate = $this->calendar($date,$adjustment);
//    }

    public function date($date = false,$adjustment = 0) {
        $this->aDate = $this->calendar($date,$adjustment);
        return $this;
    }

    private function gmod($n, $m) {
        return (($n % $m) + $m) % $m;
    }

    private function calendar($date,$adjustment) {
        if ($date) {
            $date = strtotime($date);
        } else {
            $date = time();
        }
        if ($adjustment) {
            // $adjustmentmilli = 1000 * 60 * 60 * 24 * $adjustment;
            // $date += $adjustmentmilli;
            $date = strtotime(($adjustment > 0 ? '+' . $adjustment : $adjustment) . ' day',$date);
        }
        $day = date('j',$date);
        $month = date('n',$date);
        $year = date('Y',$date);
        $m = $month;
        $y = $year;
        if ($m < 3) {
            $y -= 1;
            $m += 12;
        }

        $a = floor($y / 100.);
        $b = 2 - $a + floor($a / 4.);
        if ($y < 1583)
            $b = 0;
        if ($y == 1582) {
            if ($m > 10)
                $b = -10;
            if ($m == 10) {
                $b = 0;
                if ($day > 4)
                    $b = -10;
            }
        }

        $jd = floor(365.25 * ($y + 4716)) + floor(30.6001 * ($m + 1)) + $day + $b - 1524;
        $b = 0;
        if ($jd > 2299160) {
            $a = floor(($jd - 1867216.25) / 36524.25);
            $b = 1 + $a - floor($a / 4.);
        }
        $bb = $jd + $b + 1524;
        $cc = floor(($bb - 122.1) / 365.25);
        $dd = floor(365.25 * $cc);
        $ee = floor(($bb - $dd) / 30.6001);
        $day = ($bb - $dd) - floor(30.6001 * $ee);
        $month = $ee - 1;
        if ($ee > 13) {
            $cc += 1;
            $month = $ee - 13;
        }
        $year = $cc - 4716;
        if ($adjustment) {
            $wd = $this->gmod($jd + 1 - $adjustment, 7) + 1;
        } else {
            $wd = $this->gmod($jd + 1, 7) + 1;
        }

        $iyear = 10631. / 30.;
        $epochastro = 1948084;
        $epochcivil = 1948085;
        $shift1 = 8.01 / 60.;
        $z = $jd - $epochastro;
        $cyc = floor($z / 10631.);
        $z = $z - 10631 * $cyc;
        $j = floor(($z - $shift1) / $iyear);
        $iy = 30 * $cyc + $j;
        $z = $z - floor($j * $iyear + $shift1);
        $im = floor(($z + 28.5001) / 29.5);
        if ($im == 13)
            $im = 12;
        $id = $z - floor(29.5001 * $im - 29);
        $myRes = array();
        $myRes['day'] = $day; //calculated day (CE)
        $myRes['month'] = $month - 1; //calculated month (CE)
        $myRes['year'] = $year; //calculated year (CE)
        $myRes['julian_day'] = $jd - 1; //julian day number
        $myRes['weekday'] = $wd - 1; //weekday number
        $myRes['hijri_day'] = $id; //islamic date
        $myRes['hijri_month'] = $im - 1; //islamic month
        $myRes['hijri_year'] = $iy; //islamic year

        return $myRes;
    }

//    public function getDate($format = 'f') {
//        switch($format) {
//            case 'f':
//                $res = $this->getFullDate($aDate);
//                break;
//            case 'y':
//                $res = $aDate['hijri_year'];
//                break;
//            case 'd':
//                $res = $aDate['hijri_day'];
//                break;
//            case 'w':
//                $res = $aDate['weekday'];
//                break;
//            case 'l':
//                $res = $this->getWeekDay($aDate['weekday']);
//                break;
//            case 'n':
//                $res = $aDate['hijri_month'];
//                break;
//            case 'm':
//                $res = $this->getMonth($aDate['hijri_month']);
//                break;
//            default:
//                $res = $this->getFullDate($aDate);
//                break;
//        }
//        return $res;
//    }

    public function getDay() {
        return $this->aDate['hijri_day'];
    }

    public function getYear() {
        return $this->aDate['hijri_year'];
    }

    public function getFullDate() {
        return date('jS',mktime(0,0,0,0,$this->aDate['hijri_day'],0)) . " " . $this->getMonth(true) . " " . $this->aDate['hijri_year'] . " AH";
    }

    public function getMonth($bName = false) {
        if($bName) {
            return $this->iMonthNames[$this->aDate['hijri_month']];

        }
        else {
            return $this->aDate['hijri_month'];
        }
    }

    public function getWeekDay($bName = false) {
        if($bName) {
            return $this->wdNames[$this->aDate['weekday']];
        }
        else {
            return $this->aDate['weekday'];
        }
    }

} 