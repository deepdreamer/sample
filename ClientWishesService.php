<?php

declare(strict_types=1);

namespace App\Services;

use App\Entity\Main\Client;
use App\Entity\Main\ClientWish;
use App\Entity\Main\ClientWishesCatering;
use App\Entity\Main\ClientWishesPersons;
use App\Entity\Main\ClientWishesProcedureType;
use App\Entity\Main\ClientWishesRoom;
use App\Entity\Main\ClientWishesStay;
use App\Entity\Main\ClientWishesStayLength;
use App\Enum\ApplicationType;
use App\Enum\Currency;
use App\Enum\PackageCateringType;
use App\Enum\PackageType;
use App\Enum\PersonType;
use App\Enum\RoomsType;
use App\Filters\KurDurationFilter;
use App\Filters\WellnessDurationFilter;
use App\Repository\Main\CityRepository;
use App\Repository\Main\ClientRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Form\FormInterface;

class ClientWishesService
{
    public function __construct(
        private CityRepository $cityRepository,
        private ClientRepository $clientRepository,
        private EntityManagerInterface $entityManager,
    ) {
    }

    public function createClientWish(): ClientWish
    {
        $clientWish = new ClientWish();
        $clientWishStay = new ClientWishesStay();
        $clientWish->addStay($clientWishStay);

        return $clientWish;
    }

    public function saveWish(FormInterface $form, ClientWish $clientWish): ClientWish
    {
        $this->setCommon($form, $clientWish);
        $this->saveProcedures($form, $clientWish);

        $this->entityManager->persist($clientWish);
        $this->entityManager->flush();

        return $clientWish;
    }

    /**
     * @throws \DateMalformedStringException
     */
    public function saveWishFromRollDown(FormInterface $form, ClientWish $clientWish): ClientWish
    {
        $this->setCommon($form, $clientWish);
        $this->savePackageType($form, $clientWish);
        $this->saveFlexibleMonths($form, $clientWish);

        $this->entityManager->persist($clientWish);
        $this->entityManager->flush();

        return $clientWish;
    }

    private function setCommon(FormInterface $form, ClientWish $clientWish): void
    {
        $client = $this->updateOrSaveClient($form, $clientWish);
        $clientWish->setClient($client);
        $this->saveRoomsInfo($form, $clientWish);
        $this->saveCities($form, $clientWish);
        $this->saveCateringInfo($form, $clientWish);
        $this->setMaxCurrency($form, $clientWish);
    }

    private function setMaxCurrency(FormInterface $form, ClientWish $clientWish): void
    {
        $lang = $form->get('lang')->getData();
        if ($lang === 'cs') {
            $clientWish->setMaxPriceCurrency(Currency::getKey(Currency::CZK));
        } else {
            $clientWish->setMaxPriceCurrency(Currency::getKey(Currency::EUR));
        }
    }

    private function saveProcedures(FormInterface $form, ClientWish $clientWish): void
    {
        $procedureType = $form->get('procedureType')->getData();

        $wellnessAlreadySaved = false;
        foreach ($procedureType as $applicationId) {
            $clientWishProcedureType = new ClientWishesProcedureType();

            if ($applicationId === 1 || $applicationId === 5) {
                if ($wellnessAlreadySaved) {
                    continue;
                } else {
                    $wellnessAlreadySaved = true;
                    $applicationId = 1;
                }
            }
            $clientWishProcedureType->setProcedureType(ApplicationType::getKey($applicationId));
            $clientWish->addProcedureType($clientWishProcedureType);
        }
    }

    private function savePackageType(FormInterface $form, ClientWish $clientWish): void
    {
        $kurType = $form->get('kurType')->getData();
        $wellnessType = $form->get('wellnessType')->getData();

        if (!empty($kurType)) {
            $this->saveKurLengths($kurType, $clientWish);
            $this->saveCateringInfo($form, $clientWish);
        } else if (!empty($wellnessType)) {
            $this->saveWellnessLengths($wellnessType, $clientWish);
        }
    }

    /**
     * @throws \DateMalformedStringException
     */
    private function saveFlexibleMonths(FormInterface $form, ClientWish $clientWish): void
    {
        $flexibleMonths = $form->get('flexibleMonths')->getData();
        foreach ($flexibleMonths as $monthIndex) {
            $stay = $this->createStay($monthIndex);
            $stay->setClientWishes($clientWish);
            $this->entityManager->persist($stay);
        }
    }

    /**
     * @throws \DateMalformedStringException
     */
    private function createStay(int $monthIndex): ClientWishesStay
    {
        $start = new \DateTime();
        $isMonthForNextYear = (int) $start->format('n') > $monthIndex;
        if ($isMonthForNextYear) {
            $start->modify('+1 year');
        }

        $start->setDate((int) $start->format('Y'), $monthIndex, (int) $start->format('d'));
        $start->modify('first day of');

        $end = clone $start;
        $end->modify('last day of');

        $stay = new ClientWishesStay();
        $stay->setStartDate($start);
        $stay->setEndDate($end);

        return $stay;
    }

    /**
     * @param array<mixed> $wellnessTypes
     */
    private function saveWellnessLengths(array $wellnessTypes, ClientWish $clientWish): void
    {
        $clientWish->setPackageType(PackageType::wellness);

        $wellnessFilters = new WellnessDurationFilter();

        foreach ($wellnessTypes as $wellnessType) {
            $stayLength = new ClientWishesStayLength();

            $stayLength->setClientWishes($clientWish);

            if ($wellnessFilters->getShortFilter() === $wellnessType) {
                $stayLength->setNights(3);
            } elseif ($wellnessFilters->getMediumFilter() === $wellnessType) {
                $stayLength->setNights(5);
            } elseif ($wellnessFilters->getLongFilter() === $wellnessType) {
                $stayLength->setNights(7);
            }

            $this->entityManager->persist($stayLength);
        }
    }

    /**
     * @param array<mixed> $kurTypes
     */
    private function saveKurLengths(array $kurTypes, ClientWish $clientWish): void
    {
        $clientWish->setPackageType(PackageType::kur);

        $kurFilters = new KurDurationFilter();

        foreach ($kurTypes as $kurType) {
            $stayLength = new ClientWishesStayLength();

            $stayLength->setClientWishes($clientWish);

            if ($kurFilters->getShortFilter() === $kurType) {
                $stayLength->setNights(7);
            } elseif ($kurFilters->getMediumFilter() === $kurType) {
                $stayLength->setNights(14);
            } elseif ($kurFilters->getLongFilter() === $kurType) {
                $stayLength->setNights(21);
            }

            $this->entityManager->persist($stayLength);
        }
    }

    private function createAndSetPersonOfType(ClientWish $wish, ClientWishesRoom $room, string $personType): void
    {
        $clientWishPerson = new ClientWishesPersons();
        $clientWishPerson->setPersonType($personType);
        $wish->addPerson($clientWishPerson);
        $clientWishPerson->setClientWishesRoom($room);
        $clientWishPerson->setClientWishes($wish);

        $this->entityManager->persist($clientWishPerson);
    }

    private function saveCateringInfo(FormInterface $form, ClientWish $clientWish): void
    {
        $catering = $form->get('catering')->getData();
        foreach ($catering as $cateringId) {
            $cateringWish = new ClientWishesCatering();
            $cateringWish->setCatering(PackageCateringType::getKey((int) $cateringId));
            $clientWish->addCatering($cateringWish);

            $this->entityManager->persist($cateringWish);
        }
    }

    private function updateOrSaveClient(FormInterface $form, ClientWish $clientWish): Client
    {
        $email = $form->get('mail')->getData();
        $client = $this->clientRepository->findOneBy(['email' => $email]);

        if (!$client) {
            $client = new Client();
            $client->setEmail($email);
            $client->setPhone($clientWish->getPhone());
            $client->setNameFirst($clientWish->getName());
            $this->entityManager->persist($client);
        }

        return $client;
    }

    private function saveCities(FormInterface $form, ClientWish $clientWish): void
    {
        $selectedCities = $form->get('city')->getData();
        $cities = $this->cityRepository->findBy(['id' => $selectedCities]);

        foreach ($cities as $city) {
            $clientWish->addCity($city);
        }
    }

    private function saveRoomsInfo(FormInterface $form, ClientWish $clientWish): void
    {
        $numOfOnePersonRoom = $form->get('numOfOnePersonRoom')->getData();
        $numOfTwoPersonRoom = $form->get('numOfTwoPersonRoom')->getData();
        $numOfThreePersonRoom = $form->get('numOfThreePersonRoom')->getData();
        $numOfSuiteRoom = $form->get('numOfSuiteRoom')->getData();

        if ($numOfOnePersonRoom > 10) {
            $numOfOnePersonRoom = 10;
        }

        if ($numOfTwoPersonRoom > 10) {
            $numOfTwoPersonRoom = 10;
        }

        if ($numOfThreePersonRoom > 10) {
            $numOfThreePersonRoom = 10;
        }

        if ($numOfSuiteRoom > 10) {
            $numOfSuiteRoom = 10;
        }

        for ($i = 0; $i < $numOfOnePersonRoom; $i++) {
            $room = $clientWish->addRoomOfType(RoomsType::SINGLE_BEDROOM);
            $this->entityManager->persist($room);
            $this->createAndSetPersonOfType($clientWish, $room, PersonType::ADULT);
        }

        for ($i = 0; $i < $numOfTwoPersonRoom; $i++) {
            $room = $clientWish->addRoomOfType(RoomsType::TWO_BEDROOM);
            $this->entityManager->persist($room);
            for ($j = 0; $j < 2; $j++) {
                $this->createAndSetPersonOfType($clientWish, $room, PersonType::ADULT);
            }
        }

        for ($i = 0; $i < $numOfThreePersonRoom; $i++) {
            $room = $clientWish->addRoomOfType(RoomsType::THREE_BEDROOM);
            $this->entityManager->persist($room);
            for ($j = 0; $j < 3; $j++) {
                $this->createAndSetPersonOfType($clientWish, $room, PersonType::ADULT);
            }
        }

        for ($i = 0; $i < $numOfSuiteRoom; $i++) {
            $room = $clientWish->addRoomOfType(RoomsType::SUITE_ROOM);
            $this->entityManager->persist($room);
            for ($j = 0; $j < 4; $j++) {
                $this->createAndSetPersonOfType($clientWish, $room, PersonType::ADULT);
            }
        }
    }
}
